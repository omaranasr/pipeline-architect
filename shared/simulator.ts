import {
  aluCompute,
  checkAddress,
  initialMemoryValue,
  initialRegisters,
  isAlu,
  reg,
  sourceOperands,
  toInt32,
  writesRegister,
} from './isa.ts'
import { computeMetrics } from './metrics.ts'
import { runReference } from './reference.ts'
import type {
  Assumptions,
  CycleTrace,
  ForwardInfo,
  HazardInfo,
  Instruction,
  InstructionSummary,
  LatchName,
  LatchSnapshot,
  MemoryWord,
  RegisterFileBypass,
  SimulationConfig,
  SimulationResult,
  StageField,
  StageName,
  StageSlot,
} from './types.ts'

// Deterministic, cycle-by-cycle model of a classic five-stage in-order pipeline
// (IF, ID, EX, MEM, WB). Each loop iteration is one clock cycle. Within a cycle:
//   WB writes the register file in the first half, ID reads it in the second half,
//   EX selects operands (forwarding muxes), MEM accesses data memory,
//   and the hazard unit in ID decides whether IF and ID must hold.
// At the clock edge every instruction advances one stage unless a stall freezes IF/ID,
// in which case a bubble (an all-zero control word, i.e. a NOP) enters EX.

type Occupant = { kind: 'empty' } | { kind: 'bubble'; causedBy: string | null } | { kind: 'instr'; idx: number }

interface InFlight {
  /** Register-file values read in ID (re-read every cycle the instruction sits in ID). */
  idA: number
  idB: number
  /** Operands actually used in EX after the forwarding muxes. */
  opA?: number
  opB?: number
  /** ALU result, or the effective address for LW/SW. */
  aluResult?: number
  storeData?: number
  /** Value written back in WB (ALU result or loaded data). */
  result?: number
}

const EMPTY: Occupant = { kind: 'empty' }

export function describeAssumptions(forwardingEnabled: boolean): Assumptions {
  return {
    model: 'Educational, deterministic model of a classic five-stage RISC pipeline. Not a model of any real silicon.',
    stages: ['IF', 'ID', 'EX', 'MEM', 'WB'],
    issue: 'Single issue, in order. One instruction is fetched per cycle unless the pipeline is stalled. No branches, exceptions, speculation, cache misses or structural hazards.',
    forwarding: forwardingEnabled
      ? 'Full forwarding enabled: EX/MEM→EX and MEM/WB→EX bypass paths feed both ALU inputs and store data. The youngest producer (EX/MEM) has priority. A value is never forwarded before it exists, so a load followed immediately by a consumer stalls one cycle.'
      : 'Forwarding disabled: a consumer waits in ID until its producer reaches WB. A back-to-back dependency costs two stall cycles; a dependency at distance two costs one.',
    hazardPolicy:
      'The hazard unit sits in ID. On a stall the PC and the IF/ID register hold their values and a bubble (NOP control word) is inserted into ID/EX. Store data is consumed in EX, so a load followed by a store of the loaded register also stalls one cycle (no MEM→MEM forwarding).',
    registerFile:
      'R0–R15, 32-bit two’s complement. R0 always reads 0, writes to it are discarded, and it never causes a hazard. WB writes in the first half of a cycle and ID reads in the second half, so a value written in WB is visible to ID in the same cycle.',
    memory:
      'Data memory is 1 KiB (256 words), byte addressed, word accesses only. Addresses must be multiples of 4 in [0, 1020]; out-of-range or misaligned accesses abort the simulation with an error. No caches: every access takes one MEM cycle.',
    initialState: 'Ri = 4 × i (R0 = 0, R1 = 4, …, R15 = 60). Every memory word initially holds 1000 + its address.',
    clock:
      'The clock period is a user-supplied illustrative engineering assumption, not a measured silicon value. Animation speed in the UI is unrelated to the simulated clock.',
    notModelled: [
      'Branches and branch prediction',
      'Exceptions and interrupts',
      'Caches and variable memory latency',
      'Multi-cycle functional units',
      'Superscalar or out-of-order issue',
    ],
  }
}

export interface SimulateOptions extends SimulationConfig {}

export function simulate(program: readonly Instruction[], config: SimulateOptions): SimulationResult {
  const n = program.length
  if (n === 0) throw new Error('program is empty')
  const { forwardingEnabled } = config

  const regs = initialRegisters()
  const startRegs = [...regs]
  const memory = new Map<number, number>()
  const touched = new Map<number, number>()
  const readMem = (addr: number) => memory.get(addr) ?? initialMemoryValue(addr)
  const flight: InFlight[] = program.map(() => ({ idA: 0, idB: 0 }))
  const stageByCycle: InstructionSummary['stageByCycle'][] = program.map(() => [])
  const fetchCycle: number[] = Array(n).fill(0)
  const wbCycle: number[] = Array(n).fill(0)
  const stallCount: number[] = Array(n).fill(0)

  const pipe: Record<StageName, Occupant> = { IF: { kind: 'instr', idx: 0 }, ID: EMPTY, EX: EMPTY, MEM: EMPTY, WB: EMPTY }
  let pc = 1
  let fetched: number | null = 0
  let retiredCount = 0
  let stallCycles = 0
  const cycles: CycleTrace[] = []
  const maxCycles = 3 * n + 10

  const instrAt = (o: Occupant): Instruction | null => (o.kind === 'instr' ? program[o.idx] : null)

  for (let cycle = 1; retiredCount < n; cycle++) {
    if (cycle > maxCycles) throw new Error('internal error: pipeline did not drain')
    const forwards: ForwardInfo[] = []
    const hazards: HazardInfo[] = []
    const bypasses: RegisterFileBypass[] = []
    let regWrite: CycleTrace['regWrite'] = null
    let memAccess: CycleTrace['memAccess'] = null
    let retired: string | null = null

    // ---- WB: write the register file (first half of the cycle) ----
    const wbIns = instrAt(pipe.WB)
    if (wbIns) {
      const st = flight[wbIns.index]
      if (wbIns.rd !== null) {
        const discarded = wbIns.rd === 0
        if (!discarded) regs[wbIns.rd] = st.result!
        regWrite = { instrId: wbIns.id, register: wbIns.rd, value: st.result!, discarded }
      }
      retired = wbIns.id
      wbCycle[wbIns.index] = cycle
      retiredCount++
    }

    // ---- MEM: data memory access ----
    const memIns = instrAt(pipe.MEM)
    if (memIns) {
      const st = flight[memIns.index]
      if (memIns.op === 'LW' || memIns.op === 'SW') {
        const addr = st.aluResult!
        checkAddress(memIns, addr)
        if (!touched.has(addr)) touched.set(addr, initialMemoryValue(addr))
        if (memIns.op === 'LW') {
          st.result = readMem(addr)
          memAccess = { instrId: memIns.id, kind: 'load', address: addr, value: st.result }
        } else {
          memory.set(addr, st.storeData!)
          memAccess = { instrId: memIns.id, kind: 'store', address: addr, value: st.storeData! }
        }
      } else {
        st.result = st.aluResult
      }
    }

    // ---- EX: operand selection (forwarding muxes) and ALU ----
    const exIns = instrAt(pipe.EX)
    if (exIns) {
      const st = flight[exIns.index]
      let a = st.idA
      let b = st.idB
      for (const src of sourceOperands(exIns)) {
        if (src.register === 0) continue
        const stale = src.slot === 'rs1' ? st.idA : st.idB
        let value = stale
        if (forwardingEnabled) {
          const fwd = selectForward(src.register)
          if (fwd) {
            value = fwd.value
            forwards.push({
              consumerId: exIns.id,
              producerId: fwd.producer.id,
              register: src.register,
              operand: src.role,
              path: fwd.path,
              value,
              staleValue: stale,
            })
          }
        }
        if (src.slot === 'rs1') a = value
        else b = value
      }
      st.opA = a
      st.opB = b
      if (isAlu(exIns.op)) st.aluResult = aluCompute(exIns.op, a, b)
      else if (exIns.op === 'LW') st.aluResult = toInt32(a + exIns.imm!)
      else if (exIns.op === 'SW') {
        st.aluResult = toInt32(a + exIns.imm!)
        st.storeData = b
      }
    }

    // ---- ID: hazard detection and register read (second half of the cycle) ----
    const idIns = instrAt(pipe.ID)
    let stall = false
    if (idIns) {
      const exProducer = instrAt(pipe.EX)
      const memProducer = instrAt(pipe.MEM)
      for (const src of sourceOperands(idIns)) {
        if (src.register === 0) continue
        if (forwardingEnabled) {
          if (exProducer && exProducer.op === 'LW' && writesRegister(exProducer) && exProducer.rd === src.register) {
            hazards.push(hazard('load-use', idIns, exProducer, src.register, 'EX', src.role))
          }
        } else if (exProducer && writesRegister(exProducer) && exProducer.rd === src.register) {
          hazards.push(hazard('raw-no-forwarding', idIns, exProducer, src.register, 'EX', src.role))
        } else if (memProducer && writesRegister(memProducer) && memProducer.rd === src.register) {
          hazards.push(hazard('raw-no-forwarding', idIns, memProducer, src.register, 'MEM', src.role))
        }
      }
      stall = hazards.length > 0
      const st = flight[idIns.index]
      st.idA = idIns.rs1 !== null ? regs[idIns.rs1] : 0
      st.idB = idIns.rs2 !== null ? regs[idIns.rs2] : 0
      if (regWrite && !regWrite.discarded) {
        const sources = new Set(sourceOperands(idIns).map((s) => s.register))
        if (sources.has(regWrite.register)) {
          bypasses.push({
            consumerId: idIns.id,
            producerId: regWrite.instrId,
            register: regWrite.register,
            value: regWrite.value,
          })
        }
      }
      if (stall) stallCount[idIns.index]++
    }
    if (stall) stallCycles++

    // ---- Snapshot of this cycle ----
    const stages = {} as Record<StageName, StageSlot>
    for (const s of ['IF', 'ID', 'EX', 'MEM', 'WB'] as StageName[]) {
      const occ = pipe[s]
      if (occ.kind === 'instr') {
        const stalled = stall && (s === 'IF' || s === 'ID')
        stages[s] = describeStage(s, program[occ.idx], flight[occ.idx], stalled, forwards, hazards, regWrite, memAccess)
        stageByCycle[occ.idx][cycle - 1] = { stage: s, stalled }
      } else {
        stages[s] = occ.kind === 'bubble' ? { kind: 'bubble', causedBy: occ.causedBy } : { kind: 'empty' }
      }
    }
    for (let i = 0; i < n; i++) if (stageByCycle[i][cycle - 1] === undefined) stageByCycle[i][cycle - 1] = null

    const fetchedId = fetched !== null ? program[fetched].id : null
    if (fetched !== null) fetchCycle[fetched] = cycle

    // ---- Clock edge: advance the pipeline ----
    const next: Record<StageName, Occupant> = { ...pipe }
    next.WB = pipe.MEM
    next.MEM = pipe.EX
    fetched = null
    if (stall) {
      next.EX = { kind: 'bubble', causedBy: idIns!.id }
      next.ID = pipe.ID
      next.IF = pipe.IF
    } else {
      next.EX = pipe.ID
      next.ID = pipe.IF
      if (pc < n) {
        next.IF = { kind: 'instr', idx: pc }
        fetched = pc
        pc++
      } else {
        next.IF = EMPTY
      }
    }

    const latches: Record<LatchName, LatchSnapshot> = {
      'IF/ID': latch(next.ID, stall, (ins) => [
        { label: 'PC', value: String(ins.index * 4) },
        { label: 'instr', value: ins.text },
      ]),
      'ID/EX': latch(next.EX, false, (ins) => idExFields(ins, flight[ins.index])),
      'EX/MEM': latch(next.MEM, false, (ins) => exMemFields(ins, flight[ins.index])),
      'MEM/WB': latch(next.WB, false, (ins) => memWbFields(ins, flight[ins.index])),
    }

    const trace: CycleTrace = {
      cycle,
      stages,
      stall,
      hazards,
      forwards,
      registerFileBypasses: bypasses,
      regWrite,
      memAccess,
      retired,
      fetched: fetchedId,
      registers: [...regs],
      latches,
      explanation: [],
    }
    trace.explanation = explainCycle(trace, program, forwardingEnabled, pc >= n && pipe.IF.kind !== 'instr')
    cycles.push(trace)

    pipe.IF = next.IF
    pipe.ID = next.ID
    pipe.EX = next.EX
    pipe.MEM = next.MEM
    pipe.WB = next.WB
  }

  /** Forwarding mux: the youngest producer wins (EX/MEM before MEM/WB). */
  function selectForward(
    register: number,
  ): { producer: Instruction; value: number; path: ForwardInfo['path'] } | null {
    const exMem = instrAt(pipe.MEM)
    if (exMem && writesRegister(exMem) && exMem.rd === register) {
      if (exMem.op === 'LW') {
        throw new Error(`internal error: ${exMem.id} load data requested from EX/MEM before it exists`)
      }
      return { producer: exMem, value: flight[exMem.index].aluResult!, path: 'EX/MEM→EX' }
    }
    const memWb = instrAt(pipe.WB)
    if (memWb && writesRegister(memWb) && memWb.rd === register) {
      return { producer: memWb, value: flight[memWb.index].result!, path: 'MEM/WB→EX' }
    }
    return null
  }

  function latch(occ: Occupant, frozen: boolean, fields: (ins: Instruction) => StageField[]): LatchSnapshot {
    if (occ.kind === 'empty') return { content: 'empty', instrId: null, text: null, frozen, fields: [] }
    if (occ.kind === 'bubble') {
      return {
        content: 'bubble',
        instrId: null,
        text: null,
        frozen,
        fields: [{ label: 'control', value: 'all zero (bubble / NOP)', tone: 'muted' }],
      }
    }
    const ins = program[occ.idx]
    return { content: 'instr', instrId: ins.id, text: ins.text, frozen, fields: fields(ins) }
  }

  // ---- Results ----
  const totalCycles = cycles.length
  const metrics = computeMetrics({
    totalCycles,
    retiredInstructions: n,
    stallCycles,
    clockPeriodNs: config.clockPeriodNs,
  })

  const memoryWords: MemoryWord[] = [...touched.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([address, initial]) => ({ address, initial, final: readMem(address) }))

  const ref = runReference(program)
  const mismatches: string[] = []
  ref.registers.forEach((v, r) => {
    if (regs[r] !== v) mismatches.push(`${reg(r)}: pipeline ${regs[r]}, reference ${v}`)
  })
  const allAddresses = new Set([...ref.memory.keys(), ...memory.keys()])
  for (const a of allAddresses) {
    const p = readMem(a)
    const r = ref.memory.get(a) ?? initialMemoryValue(a)
    if (p !== r) mismatches.push(`MEM[${a}]: pipeline ${p}, reference ${r}`)
  }

  return {
    config: { ...config },
    program: [...program],
    metrics,
    cycles,
    instructions: program.map((ins, i) => ({
      id: ins.id,
      text: ins.text,
      fetchCycle: fetchCycle[i],
      writebackCycle: wbCycle[i],
      stallCycles: stallCount[i],
      stageByCycle: stageByCycle[i],
    })),
    assumptions: describeAssumptions(forwardingEnabled),
    initialRegisters: startRegs,
    finalRegisters: [...regs],
    memory: memoryWords,
    architecturalCheck: { matchesReference: mismatches.length === 0, mismatches },
  }
}

function hazard(
  kind: HazardInfo['kind'],
  consumer: Instruction,
  producer: Instruction,
  register: number,
  producerStage: 'EX' | 'MEM',
  operand: HazardInfo['operand'],
): HazardInfo {
  return { kind, consumerId: consumer.id, producerId: producer.id, register, producerStage, operand }
}

function idExFields(ins: Instruction, st: InFlight): StageField[] {
  const f: StageField[] = []
  if (ins.op === 'NOP') return [{ label: 'control', value: 'NOP', tone: 'muted' }]
  if (ins.rs1 !== null) f.push({ label: ins.op === 'LW' || ins.op === 'SW' ? `base ${reg(ins.rs1)}` : `A ${reg(ins.rs1)}`, value: String(st.idA) })
  if (ins.rs2 !== null) f.push({ label: ins.op === 'SW' ? `data ${reg(ins.rs2)}` : `B ${reg(ins.rs2)}`, value: String(st.idB) })
  if (ins.imm !== null) f.push({ label: 'imm', value: String(ins.imm) })
  if (ins.rd !== null) f.push({ label: 'rd', value: reg(ins.rd) })
  return f
}

function exMemFields(ins: Instruction, st: InFlight): StageField[] {
  if (ins.op === 'NOP') return [{ label: 'control', value: 'NOP', tone: 'muted' }]
  if (ins.op === 'LW') return [
    { label: 'address', value: String(st.aluResult) },
    { label: 'rd', value: reg(ins.rd!) },
  ]
  if (ins.op === 'SW') return [
    { label: 'address', value: String(st.aluResult) },
    { label: 'store data', value: String(st.storeData) },
  ]
  return [
    { label: 'ALU result', value: String(st.aluResult) },
    { label: 'rd', value: reg(ins.rd!) },
  ]
}

function memWbFields(ins: Instruction, st: InFlight): StageField[] {
  if (ins.op === 'NOP' || ins.op === 'SW') return [{ label: 'RegWrite', value: '0 (no register write)', tone: 'muted' }]
  return [
    { label: ins.op === 'LW' ? 'load data' : 'ALU result', value: String(st.result) },
    { label: 'rd', value: reg(ins.rd!) },
  ]
}

function describeStage(
  stage: StageName,
  ins: Instruction,
  st: InFlight,
  stalled: boolean,
  forwards: ForwardInfo[],
  hazards: HazardInfo[],
  regWrite: CycleTrace['regWrite'],
  memAccess: CycleTrace['memAccess'],
): StageSlot {
  const base = { kind: 'instr' as const, instrId: ins.id, index: ins.index, op: ins.op, text: ins.text, status: stalled ? ('stalled' as const) : ('active' as const) }
  const fields: StageField[] = []
  let action = ''
  switch (stage) {
    case 'IF':
      action = stalled ? 'Held in IF: PC and IF/ID are frozen by the stall' : `Fetched from instruction memory at PC = ${ins.index * 4}`
      fields.push({ label: 'PC', value: String(ins.index * 4) })
      break
    case 'ID': {
      const srcs = sourceOperands(ins)
      if (stalled) {
        const h = hazards[0]
        action = `Stalled: waiting for ${reg(h.register)} from ${h.producerId}`
      } else {
        action = ins.op === 'NOP' ? 'Decoded NOP (no operands)' : srcs.length ? `Decoded; read ${srcs.map((s) => reg(s.register)).join(', ')} from the register file` : 'Decoded'
      }
      for (const s of srcs) {
        const v = s.slot === 'rs1' ? st.idA : st.idB
        const blocked = hazards.some((h) => h.register === s.register)
        fields.push({ label: `${s.role} ${reg(s.register)}`, value: String(v), tone: blocked ? 'hazard' : undefined })
      }
      if (ins.rd !== null) fields.push({ label: 'dest', value: reg(ins.rd) })
      break
    }
    case 'EX': {
      const fwd = (role: string) => forwards.find((f) => f.consumerId === ins.id && f.operand === role)
      if (ins.op === 'NOP') {
        action = 'No operation'
        break
      }
      const aRole = ins.op === 'LW' || ins.op === 'SW' ? 'base address' : 'operand A'
      const fa = fwd(aRole)
      fields.push({ label: `${aRole} ${reg(ins.rs1!)}`, value: String(st.opA), tone: fa ? 'forwarded' : undefined })
      if (isAlu(ins.op)) {
        const fb = fwd('operand B')
        fields.push({ label: `operand B ${reg(ins.rs2!)}`, value: String(st.opB), tone: fb ? 'forwarded' : undefined })
        fields.push({ label: 'ALU result', value: String(st.aluResult), tone: 'write' })
        action = `ALU computes ${st.opA} ${aluSymbol(ins.op)} ${st.opB} = ${st.aluResult}`
      } else {
        fields.push({ label: 'offset', value: String(ins.imm) })
        fields.push({ label: 'address', value: String(st.aluResult), tone: 'memory' })
        if (ins.op === 'SW') {
          const fd = fwd('store data')
          fields.push({ label: `store data ${reg(ins.rs2!)}`, value: String(st.storeData), tone: fd ? 'forwarded' : undefined })
        }
        action = `Address = ${st.opA} + ${ins.imm} = ${st.aluResult}`
      }
      break
    }
    case 'MEM':
      if (ins.op === 'LW' && memAccess) {
        action = `Load MEM[${memAccess.address}] = ${memAccess.value}`
        fields.push({ label: 'address', value: String(memAccess.address), tone: 'memory' })
        fields.push({ label: 'load data', value: String(memAccess.value), tone: 'memory' })
      } else if (ins.op === 'SW' && memAccess) {
        action = `Store ${memAccess.value} to MEM[${memAccess.address}]`
        fields.push({ label: 'address', value: String(memAccess.address), tone: 'memory' })
        fields.push({ label: 'store data', value: String(memAccess.value), tone: 'memory' })
      } else if (ins.op === 'NOP') {
        action = 'No operation'
      } else {
        action = `No memory access; ALU result ${st.result} passes through`
        fields.push({ label: 'ALU result', value: String(st.result) })
      }
      break
    case 'WB':
      if (regWrite && regWrite.instrId === ins.id) {
        action = regWrite.discarded
          ? `Write to R0 discarded (R0 is hardwired to 0)`
          : `Write ${reg(regWrite.register)} ← ${regWrite.value}`
        fields.push({ label: reg(regWrite.register), value: regWrite.discarded ? '0 (discarded)' : String(regWrite.value), tone: 'write' })
      } else {
        action = ins.op === 'SW' ? 'Store completed in MEM; no register write' : 'No register write'
      }
      break
  }
  return { ...base, action, fields }
}

function aluSymbol(op: string): string {
  return { ADD: '+', SUB: '−', AND: '&', OR: '|', XOR: '^' }[op] ?? op
}

function explainCycle(t: CycleTrace, program: readonly Instruction[], forwardingEnabled: boolean, draining: boolean): string[] {
  const out: string[] = []
  const text = (id: string) => program.find((p) => p.id === id)!.text
  const name = (id: string) => `${id} (${text(id)})`

  if (t.stall) {
    const h = t.hazards[0]
    if (h.kind === 'load-use') {
      out.push(
        `Load-use hazard: ${name(h.consumerId)} needs ${reg(h.register)} from ${name(h.producerId)}, which is still in EX. The loaded value only exists at the end of MEM, so forwarding cannot help yet.`,
      )
    } else {
      const remaining = h.producerStage === 'EX' ? 2 : 1
      out.push(
        `RAW hazard without forwarding: ${name(h.consumerId)} needs ${reg(h.register)} from ${name(h.producerId)}, which is now in ${h.producerStage}. It can read the value only when the producer reaches WB — ${remaining} more stall cycle${remaining > 1 ? 's' : ''} including this one.`,
      )
    }
    out.push(`Stall: the PC and IF/ID hold their values, ${h.consumerId} stays in ID, and a bubble is inserted into EX at the next clock edge.`)
  }

  for (const f of t.forwards) {
    out.push(
      `Forwarding (${f.path}): ${f.consumerId} takes ${reg(f.register)} = ${f.value} as its ${f.operand} from ${f.producerId} instead of the stale register-file value ${f.staleValue}.`,
    )
  }
  for (const b of t.registerFileBypasses) {
    out.push(
      `Register file write-then-read: ${b.producerId} writes ${reg(b.register)} = ${b.value} in the first half of the cycle and ${b.consumerId} reads it in ID in the second half.`,
    )
  }
  if (t.stages.EX.kind === 'bubble') {
    out.push(`A bubble occupies EX${t.stages.EX.causedBy ? ` (inserted for ${t.stages.EX.causedBy})` : ''}; it does no work and will drain through MEM and WB.`)
  }
  if (t.memAccess) {
    out.push(
      t.memAccess.kind === 'load'
        ? `MEM: ${t.memAccess.instrId} loads ${t.memAccess.value} from address ${t.memAccess.address}.`
        : `MEM: ${t.memAccess.instrId} stores ${t.memAccess.value} to address ${t.memAccess.address}.`,
    )
  }
  if (t.regWrite) {
    out.push(
      t.regWrite.discarded
        ? `WB: ${t.regWrite.instrId} targets R0; the write is discarded because R0 is hardwired to zero.`
        : `WB: ${t.regWrite.instrId} writes ${reg(t.regWrite.register)} ← ${t.regWrite.value}.`,
    )
  }
  if (t.retired) out.push(`${t.retired} retires.`)

  if (t.cycle <= 4 && !t.retired) {
    out.push(`Pipeline filling: the first instruction reaches WB in cycle 5, so no instruction completes before then.`)
  } else if (draining && !t.stall) {
    out.push('Pipeline draining: there are no more instructions to fetch, so IF is empty.')
  }
  if (!t.stall && t.forwards.length === 0 && t.registerFileBypasses.length === 0 && out.length <= 2) {
    out.unshift(forwardingEnabled ? 'All stages advance; no hazard this cycle.' : 'All stages advance; no hazard this cycle (forwarding disabled).')
  }
  return out
}
