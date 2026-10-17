// Shared types for the Pipeline Architect simulation engine, REST API and UI.
// The engine itself runs only on the server (Cloudflare Pages Functions) and in tests;
// the frontend imports these types to render the trace returned by /api/simulate.

export const OPCODES = ['ADD', 'SUB', 'AND', 'OR', 'XOR', 'LW', 'SW', 'NOP'] as const
export type Opcode = (typeof OPCODES)[number]
export type AluOpcode = 'ADD' | 'SUB' | 'AND' | 'OR' | 'XOR'

export const STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'] as const
export type StageName = (typeof STAGES)[number]

export const LATCHES = ['IF/ID', 'ID/EX', 'EX/MEM', 'MEM/WB'] as const
export type LatchName = (typeof LATCHES)[number]

/** A decoded instruction of the educational ISA. */
export interface Instruction {
  /** Stable identifier shown in the UI: I1, I2, ... */
  id: string
  /** Zero-based position in the program (also the fetch order). */
  index: number
  op: Opcode
  /** Canonical assembly text, e.g. "ADD R1, R2, R3" or "LW R1, 4(R2)". */
  text: string
  /** Destination register (ALU ops and LW). null for SW and NOP. */
  rd: number | null
  /** First source: ALU operand A, or the base register of LW/SW. */
  rs1: number | null
  /** Second source: ALU operand B, or the store-data register of SW. */
  rs2: number | null
  /** Signed byte offset for LW/SW. */
  imm: number | null
}

export interface StageField {
  label: string
  value: string
  /** Optional emphasis for the UI. */
  tone?: 'forwarded' | 'hazard' | 'write' | 'memory' | 'muted'
}

export type StageSlot =
  | { kind: 'empty' }
  | { kind: 'bubble'; /** Instruction whose hazard created this bubble. */ causedBy: string | null }
  | {
      kind: 'instr'
      instrId: string
      index: number
      op: Opcode
      text: string
      status: 'active' | 'stalled'
      /** One-line description of what the stage does to this instruction in this cycle. */
      action: string
      fields: StageField[]
    }

export interface LatchSnapshot {
  /** Contents latched at the clock edge that ends this cycle. */
  content: 'empty' | 'bubble' | 'instr'
  instrId: string | null
  text: string | null
  /** True when the latch kept its previous value because of a stall. */
  frozen: boolean
  fields: StageField[]
}

export type HazardKind = 'load-use' | 'raw-no-forwarding'

export interface HazardInfo {
  kind: HazardKind
  consumerId: string
  producerId: string
  register: number
  /** Stage the producer occupies during the stalled cycle. */
  producerStage: 'EX' | 'MEM'
  operand: OperandRole
}

export type OperandRole = 'operand A' | 'operand B' | 'base address' | 'store data'

export type ForwardPath = 'EX/MEM→EX' | 'MEM/WB→EX'

export interface ForwardInfo {
  consumerId: string
  producerId: string
  register: number
  operand: OperandRole
  path: ForwardPath
  value: number
  /** Value the consumer had read from the register file in ID (now stale). */
  staleValue: number
}

export interface RegisterFileBypass {
  consumerId: string
  producerId: string
  register: number
  value: number
}

export interface CycleTrace {
  /** 1-based clock cycle number. */
  cycle: number
  stages: Record<StageName, StageSlot>
  /** True when the hazard unit stalled IF and ID during this cycle. */
  stall: boolean
  hazards: HazardInfo[]
  forwards: ForwardInfo[]
  /** WB write and ID read of the same register in the same cycle (register file write-then-read). */
  registerFileBypasses: RegisterFileBypass[]
  regWrite: { instrId: string; register: number; value: number; discarded: boolean } | null
  memAccess: { instrId: string; kind: 'load' | 'store'; address: number; value: number } | null
  /** Instruction that completed WB in this cycle. */
  retired: string | null
  /** Instruction that entered IF in this cycle. */
  fetched: string | null
  /** Architectural register file at the end of this cycle (R0..R15). */
  registers: number[]
  /** Pipeline registers after the clock edge at the end of this cycle. */
  latches: Record<LatchName, LatchSnapshot>
  explanation: string[]
}

export interface Metrics {
  totalCycles: number
  retiredInstructions: number
  stallCycles: number
  /** N + 4: cycles for N instructions with no stalls in a 5-stage pipeline. */
  idealCycles: number
  /** Cycles spent filling and draining the pipeline (always 4 for this model). */
  fillDrainCycles: number
  cpi: number
  ipc: number
  clockPeriodNs: number
  frequencyGHz: number
  executionTimeNs: number
  /** Retired instructions per second. */
  throughputIps: number
}

export interface InstructionSummary {
  id: string
  text: string
  fetchCycle: number
  /** Cycle in which the instruction was in WB. */
  writebackCycle: number
  /** Cycles this instruction spent held in ID by the hazard unit. */
  stallCycles: number
  /** Stage occupied in each cycle (index = cycle - 1); null when not in the pipeline. */
  stageByCycle: ({ stage: StageName; stalled: boolean } | null)[]
}

export interface MemoryWord {
  address: number
  initial: number
  final: number
}

export interface Assumptions {
  model: string
  stages: StageName[]
  issue: string
  forwarding: string
  hazardPolicy: string
  registerFile: string
  memory: string
  initialState: string
  clock: string
  notModelled: string[]
}

export interface SimulationConfig {
  workloadId: string
  forwardingEnabled: boolean
  clockPeriodNs: number
}

export interface SimulationResult {
  config: SimulationConfig
  program: Instruction[]
  metrics: Metrics
  cycles: CycleTrace[]
  instructions: InstructionSummary[]
  assumptions: Assumptions
  initialRegisters: number[]
  finalRegisters: number[]
  /** Memory words read or written by the program. */
  memory: MemoryWord[]
  /** Comparison of the pipeline's final state with a sequential (non-pipelined) reference interpreter. */
  architecturalCheck: { matchesReference: boolean; mismatches: string[] }
}

export interface WorkloadDefinition {
  id: string
  label: string
  title: string
  summary: string
  lesson: string
  instructions: string[]
}
