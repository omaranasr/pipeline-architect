import { describe, expect, it } from 'vitest'
import { SimulationError } from '../shared/isa.ts'
import { parseInstructionList } from '../shared/parser.ts'
import { simulate } from '../shared/simulator.ts'
import { WORKLOADS } from '../shared/workloads.ts'
import { row, run } from './helpers.ts'

const INDEPENDENT = ['ADD R1, R2, R3', 'SUB R4, R5, R6', 'AND R7, R8, R9', 'OR R10, R11, R12', 'XOR R13, R14, R15']

describe('ideal pipeline', () => {
  it.each([true, false])('5 independent instructions take 9 cycles with 0 stalls (forwarding=%s)', (fwd) => {
    const r = run(INDEPENDENT, fwd)
    expect(r.metrics.totalCycles).toBe(9)
    expect(r.metrics.stallCycles).toBe(0)
    expect(r.metrics.retiredInstructions).toBe(5)
    expect(r.cycles.every((c) => c.forwards.length === 0 && !c.stall)).toBe(true)
  })

  it('N independent instructions take N + 4 cycles', () => {
    for (let n = 1; n <= 12; n++) {
      const lines = Array.from({ length: n }, (_, i) => `ADD R${(i % 7) + 1}, R8, R9`)
      // distinct destinations within any window of 3 instructions, sources never written
      expect(run(lines, true).metrics.totalCycles).toBe(n + 4)
      expect(run(lines, false).metrics.totalCycles).toBe(n + 4)
    }
  })

  it('shows the classic staircase diagram', () => {
    const r = run(INDEPENDENT, true)
    expect(row(r, 'I1')).toBe('IF ID EX MEM WB - - - -')
    expect(row(r, 'I3')).toBe('- - IF ID EX MEM WB - -')
    expect(row(r, 'I5')).toBe('- - - - IF ID EX MEM WB')
  })

  it('computes correct register values', () => {
    const r = run(INDEPENDENT, true)
    // Ri = 4i initially
    expect(r.finalRegisters[1]).toBe(8 + 12)
    expect(r.finalRegisters[4]).toBe(20 - 24)
    expect(r.finalRegisters[7]).toBe(32 & 36)
    expect(r.finalRegisters[10]).toBe(44 | 48)
    expect(r.finalRegisters[13]).toBe(56 ^ 60)
  })
})

describe('ALU read-after-write hazards', () => {
  const PAIR = ['ADD R1, R2, R3', 'SUB R4, R1, R5']

  it('immediately dependent ALU pair: 0 stalls with forwarding (EX/MEM→EX)', () => {
    const r = run(PAIR, true)
    expect(r.metrics.stallCycles).toBe(0)
    expect(r.metrics.totalCycles).toBe(6)
    const c4 = r.cycles[3]
    expect(c4.forwards).toEqual([
      expect.objectContaining({ consumerId: 'I2', producerId: 'I1', register: 1, path: 'EX/MEM→EX', value: 20, operand: 'operand A' }),
    ])
    expect(r.finalRegisters[4]).toBe(20 - 20)
  })

  it('immediately dependent ALU pair: 2 stalls without forwarding', () => {
    const r = run(PAIR, false)
    expect(r.metrics.stallCycles).toBe(2)
    expect(r.metrics.totalCycles).toBe(8)
    expect(row(r, 'I2')).toBe('- IF ID* ID* ID EX MEM WB')
    // bubbles enter EX in the cycles after each stall
    expect(r.cycles[3].stages.EX.kind).toBe('bubble')
    expect(r.cycles[4].stages.EX.kind).toBe('bubble')
    // the read in cycle 5 happens in the same cycle as I1's WB
    expect(r.cycles[4].registerFileBypasses).toEqual([
      expect.objectContaining({ consumerId: 'I2', producerId: 'I1', register: 1, value: 20 }),
    ])
    expect(r.finalRegisters[4]).toBe(0)
    expect(r.cycles.some((c) => c.forwards.length > 0)).toBe(false)
  })

  it('distance-2 dependency: 1 stall without forwarding, MEM/WB→EX with forwarding', () => {
    const lines = ['ADD R1, R2, R3', 'AND R7, R8, R9', 'SUB R4, R1, R5']
    expect(run(lines, false).metrics.stallCycles).toBe(1)
    const r = run(lines, true)
    expect(r.metrics.stallCycles).toBe(0)
    expect(r.cycles[4].forwards[0]).toMatchObject({ consumerId: 'I3', path: 'MEM/WB→EX', register: 1, value: 20 })
  })

  it('distance-3 dependency needs no stall: same-cycle register-file write/read', () => {
    const lines = ['ADD R1, R2, R3', 'AND R7, R8, R9', 'OR R10, R11, R12', 'SUB R4, R1, R5']
    for (const fwd of [true, false]) {
      const r = run(lines, fwd)
      expect(r.metrics.stallCycles).toBe(0)
      expect(r.cycles[4].registerFileBypasses[0]).toMatchObject({ consumerId: 'I4', producerId: 'I1', register: 1 })
      expect(r.finalRegisters[4]).toBe(0)
    }
  })

  it('both source operands forwarded from different producers', () => {
    const r = run(['ADD R1, R2, R3', 'ADD R5, R6, R7', 'SUB R8, R5, R1'], true)
    const fw = r.cycles[4].forwards
    expect(fw).toHaveLength(2)
    expect(fw.find((f) => f.register === 5)).toMatchObject({ path: 'EX/MEM→EX', producerId: 'I2', operand: 'operand A' })
    expect(fw.find((f) => f.register === 1)).toMatchObject({ path: 'MEM/WB→EX', producerId: 'I1', operand: 'operand B' })
    expect(r.finalRegisters[8]).toBe(4 * 6 + 4 * 7 - 20)
  })

  it('multiple producers of one register: the youngest (EX/MEM) wins', () => {
    const r = run(['ADD R10, R1, R2', 'SUB R10, R10, R3', 'AND R11, R10, R10'], true)
    const fw = r.cycles[4].forwards
    expect(fw).toHaveLength(2)
    for (const f of fw) expect(f).toMatchObject({ producerId: 'I2', path: 'EX/MEM→EX', value: 0 })
    expect(r.finalRegisters[10]).toBe(0)
    expect(r.finalRegisters[11]).toBe(0) // would be 12 if the older ADD were forwarded
  })

  it('dependent-alu workload: 9 cycles with forwarding, 17 without', () => {
    const lines = WORKLOADS.find((w) => w.id === 'dependent-alu')!.instructions
    expect(run(lines, true).metrics).toMatchObject({ totalCycles: 9, stallCycles: 0 })
    expect(run(lines, false).metrics).toMatchObject({ totalCycles: 17, stallCycles: 8 })
  })
})

describe('load-use hazards', () => {
  const PAIR = ['LW R1, 0(R0)', 'ADD R2, R1, R3']

  it('immediate load-use pair: exactly 1 stall with forwarding', () => {
    const r = run(PAIR, true)
    expect(r.metrics.stallCycles).toBe(1)
    expect(r.metrics.totalCycles).toBe(7)
    expect(r.cycles[2].hazards).toEqual([
      expect.objectContaining({ kind: 'load-use', consumerId: 'I2', producerId: 'I1', register: 1, producerStage: 'EX' }),
    ])
    expect(row(r, 'I2')).toBe('- IF ID* ID EX MEM WB')
    expect(r.cycles[3].stages.EX).toEqual({ kind: 'bubble', causedBy: 'I2' })
    // the loaded value is forwarded from MEM/WB, never from EX/MEM
    expect(r.cycles[4].forwards).toEqual([expect.objectContaining({ path: 'MEM/WB→EX', value: 1000 })])
    expect(r.finalRegisters[2]).toBe(1000 + 12)
  })

  it('immediate load-use pair: 2 stalls without forwarding', () => {
    const r = run(PAIR, false)
    expect(r.metrics.stallCycles).toBe(2)
    expect(r.finalRegisters[2]).toBe(1012)
  })

  it('load followed by an independent instruction then a consumer: no stall with forwarding', () => {
    const r = run(['LW R1, 0(R0)', 'AND R7, R8, R9', 'ADD R2, R1, R3'], true)
    expect(r.metrics.stallCycles).toBe(0)
    expect(r.cycles[4].forwards[0]).toMatchObject({ path: 'MEM/WB→EX', value: 1000 })
  })

  it('store data dependent on an ALU result is forwarded without a stall', () => {
    const r = run(['ADD R1, R2, R3', 'SW R1, 0(R0)'], true)
    expect(r.metrics.stallCycles).toBe(0)
    expect(r.cycles[3].forwards[0]).toMatchObject({ operand: 'store data', path: 'EX/MEM→EX', value: 20 })
    expect(r.memory).toEqual([{ address: 0, initial: 1000, final: 20 }])
  })

  it('store data dependent on a load stalls one cycle (no MEM→MEM path)', () => {
    const r = run(['LW R1, 0(R0)', 'SW R1, 4(R0)'], true)
    expect(r.metrics.stallCycles).toBe(1)
    expect(r.cycles[2].hazards[0]).toMatchObject({ operand: 'store data', kind: 'load-use' })
    expect(r.memory.find((m) => m.address === 4)).toEqual({ address: 4, initial: 1004, final: 1000 })
  })

  it('load base address dependency is a hazard too', () => {
    const r = run(['LW R1, 0(R0)', 'LW R2, -1000(R1)'], true)
    expect(r.metrics.stallCycles).toBe(1)
    expect(r.cycles[2].hazards[0].operand).toBe('base address')
    expect(r.finalRegisters[2]).toBe(1000)
  })

  it('load-use workload: 2 stalls with forwarding, 6 without', () => {
    const lines = WORKLOADS.find((w) => w.id === 'load-use')!.instructions
    expect(run(lines, true).metrics).toMatchObject({ totalCycles: 11, stallCycles: 2 })
    expect(run(lines, false).metrics).toMatchObject({ totalCycles: 15, stallCycles: 6 })
  })

  it('reordering the load-use workload removes all stalls and keeps the result', () => {
    const original = run(WORKLOADS.find((w) => w.id === 'load-use')!.instructions, true)
    const scheduled = run(['LW R1, 0(R0)', 'LW R4, 4(R0)', 'ADD R2, R1, R3', 'SUB R5, R4, R2', 'SW R5, 8(R0)'], true)
    expect(scheduled.metrics).toMatchObject({ totalCycles: 9, stallCycles: 0 })
    expect(scheduled.finalRegisters).toEqual(original.finalRegisters)
  })
})

describe('register zero', () => {
  it.each([true, false])('writes to R0 are discarded and R0 never causes a hazard (forwarding=%s)', (fwd) => {
    const r = run(['ADD R0, R1, R2', 'ADD R3, R0, R0', 'LW R0, 0(R0)', 'OR R4, R0, R5'], fwd)
    expect(r.metrics.stallCycles).toBe(0)
    expect(r.cycles.every((c) => c.forwards.length === 0)).toBe(true)
    expect(r.finalRegisters[0]).toBe(0)
    expect(r.finalRegisters[3]).toBe(0)
    expect(r.finalRegisters[4]).toBe(20)
    expect(r.cycles[4].regWrite).toMatchObject({ register: 0, discarded: true })
    expect(r.cycles.every((c) => c.registers[0] === 0)).toBe(true)
  })
})

describe('memory', () => {
  it('rejects misaligned and out-of-range accesses with a SimulationError', () => {
    expect(() => run(['LW R1, 2(R0)'], true)).toThrow(SimulationError)
    expect(() => run(['SW R1, 1024(R0)'], true)).toThrow(/outside data memory/)
    expect(() => run(['LW R1, -4(R0)'], true)).toThrow(/outside data memory/)
  })

  it('a load after a store to the same address sees the stored value', () => {
    const r = run(['ADD R1, R2, R3', 'SW R1, 40(R0)', 'LW R5, 40(R0)'], true)
    expect(r.finalRegisters[5]).toBe(20)
  })
})

describe('trace consistency (all workloads, both modes)', () => {
  const cases = WORKLOADS.flatMap((w) => [true, false].map((fwd) => ({ w, fwd })))

  it.each(cases)('$w.id forwarding=$fwd', ({ w, fwd }) => {
    const parsed = parseInstructionList(w.instructions)
    if (!parsed.ok) throw new Error('parse')
    const r = simulate(parsed.instructions, { workloadId: w.id, forwardingEnabled: fwd, clockPeriodNs: 0.5 })
    const n = parsed.instructions.length

    // pipeline must reproduce the sequential reference semantics
    expect(r.architecturalCheck).toEqual({ matchesReference: true, mismatches: [] })
    // cycle-count identity
    expect(r.metrics.totalCycles).toBe(n + 4 + r.metrics.stallCycles)
    expect(r.cycles).toHaveLength(r.metrics.totalCycles)
    expect(r.cycles.filter((c) => c.stall)).toHaveLength(r.metrics.stallCycles)
    expect(r.instructions.reduce((s, i) => s + i.stallCycles, 0)).toBe(r.metrics.stallCycles)
    // every instruction retires exactly once, in program order
    expect(r.cycles.map((c) => c.retired).filter(Boolean)).toEqual(parsed.instructions.map((i) => i.id))
    expect(r.cycles.at(-1)!.retired).toBe(`I${n}`)

    r.cycles.forEach((c, i) => {
      expect(c.cycle).toBe(i + 1)
      expect(c.explanation.length).toBeGreaterThan(0)
      // a stall freezes IF/ID and inserts a bubble into EX in the next cycle
      if (c.stall) {
        expect(c.stages.ID.kind === 'instr' && c.stages.ID.status).toBe('stalled')
        expect(c.hazards.length).toBeGreaterThan(0)
        expect(c.latches['IF/ID'].frozen).toBe(true)
        expect(c.latches['ID/EX'].content).toBe('bubble')
        const next = r.cycles[i + 1]
        expect(next.stages.EX.kind).toBe('bubble')
        expect(next.stages.ID).toMatchObject({ instrId: (c.stages.ID as { instrId: string }).instrId })
      } else {
        expect(c.hazards).toHaveLength(0)
      }
      if (fwd) expect(c.hazards.every((h) => h.kind === 'load-use')).toBe(true)
      else expect(c.forwards).toHaveLength(0)
      // forwarding never sources a load from EX/MEM
      for (const f of c.forwards) {
        const producer = parsed.instructions.find((p) => p.id === f.producerId)!
        if (producer.op === 'LW') expect(f.path).toBe('MEM/WB→EX')
      }
      // latches agree with next cycle's stage occupancy
      const next = r.cycles[i + 1]
      if (next) {
        const pairs = [['IF/ID', 'ID'], ['ID/EX', 'EX'], ['EX/MEM', 'MEM'], ['MEM/WB', 'WB']] as const
        for (const [latch, stage] of pairs) {
          const s = next.stages[stage]
          expect(c.latches[latch].content).toBe(s.kind)
          if (s.kind === 'instr') expect(c.latches[latch].instrId).toBe(s.instrId)
        }
      }
    })

    // instruction summaries are consistent with the cycle-by-cycle stages
    for (const s of r.instructions) {
      // latency = 4 + cycles held in IF or ID by a stall
      const held = s.stageByCycle.filter((x) => x?.stalled).length
      expect(s.writebackCycle - s.fetchCycle).toBe(4 + held)
      expect(s.stageByCycle.filter((x) => x?.stalled && x.stage === 'ID')).toHaveLength(s.stallCycles)
      expect(s.stageByCycle[s.fetchCycle - 1]?.stage).toBe('IF')
      expect(s.stageByCycle[s.writebackCycle - 1]?.stage).toBe('WB')
    }

    // final metrics agree with the trace
    expect(r.finalRegisters).toEqual(r.cycles.at(-1)!.registers)
    expect(r.metrics.cpi * r.metrics.ipc).toBeCloseTo(1, 12)
  })

  it('stress test: forwarding 20 cycles; priority, R0 and store forwarding all exercised', () => {
    const r = run(WORKLOADS.find((w) => w.id === 'stress')!.instructions, true)
    expect(r.metrics).toMatchObject({ totalCycles: 20, stallCycles: 2 })
    const all = r.cycles.flatMap((c) => c.forwards)
    expect(all.some((f) => f.operand === 'store data')).toBe(true)
    expect(all.filter((f) => f.consumerId === 'I9').every((f) => f.producerId === 'I8')).toBe(true)
    expect(r.finalRegisters[0]).toBe(0)
    expect(r.architecturalCheck.matchesReference).toBe(true)
  })
})
