import type { AluOpcode, Instruction, Opcode, OperandRole } from './types.ts'

/** Architectural limits of the educational machine. */
export const NUM_REGISTERS = 16
export const MEMORY_WORDS = 256
export const MEMORY_BYTES = MEMORY_WORDS * 4
export const IMM_MIN = -2048
export const IMM_MAX = 2047
export const MAX_INSTRUCTIONS = 32
export const MAX_LINE_LENGTH = 64

/** R0 = 0, Ri = 4 × i: every initial value is a valid word-aligned address. */
export function initialRegisters(): number[] {
  return Array.from({ length: NUM_REGISTERS }, (_, i) => 4 * i)
}

/** Every memory word initially holds 1000 + its byte address, so loaded values are recognisable. */
export function initialMemoryValue(address: number): number {
  return 1000 + address
}

export function toInt32(value: number): number {
  return value | 0
}

export function isAlu(op: Opcode): op is AluOpcode {
  return op === 'ADD' || op === 'SUB' || op === 'AND' || op === 'OR' || op === 'XOR'
}

export function aluCompute(op: AluOpcode, a: number, b: number): number {
  switch (op) {
    case 'ADD':
      return toInt32(a + b)
    case 'SUB':
      return toInt32(a - b)
    case 'AND':
      return a & b
    case 'OR':
      return a | b
    case 'XOR':
      return a ^ b
  }
}

/** True when the instruction architecturally changes a register (writes to R0 are discarded). */
export function writesRegister(instr: Instruction): boolean {
  return instr.rd !== null && instr.rd !== 0
}

export interface SourceOperand {
  slot: 'rs1' | 'rs2'
  register: number
  role: OperandRole
}

/** Register sources read by an instruction, including SW store data. R0 is included; hazard logic ignores it. */
export function sourceOperands(instr: Instruction): SourceOperand[] {
  switch (instr.op) {
    case 'NOP':
      return []
    case 'LW':
      return [{ slot: 'rs1', register: instr.rs1!, role: 'base address' }]
    case 'SW':
      return [
        { slot: 'rs1', register: instr.rs1!, role: 'base address' },
        { slot: 'rs2', register: instr.rs2!, role: 'store data' },
      ]
    default:
      return [
        { slot: 'rs1', register: instr.rs1!, role: 'operand A' },
        { slot: 'rs2', register: instr.rs2!, role: 'operand B' },
      ]
  }
}

export class SimulationError extends Error {
  readonly instrId: string
  constructor(instrId: string, message: string) {
    super(message)
    this.name = 'SimulationError'
    this.instrId = instrId
  }
}

/** Validates an effective address; out-of-range and misaligned accesses are reported, never wrapped. */
export function checkAddress(instr: Instruction, address: number): void {
  if (address < 0 || address > MEMORY_BYTES - 4) {
    throw new SimulationError(
      instr.id,
      `${instr.id} (${instr.text}) accesses address ${address}, outside data memory [0, ${MEMORY_BYTES - 4}].`,
    )
  }
  if (address % 4 !== 0) {
    throw new SimulationError(
      instr.id,
      `${instr.id} (${instr.text}) accesses address ${address}, which is not word-aligned (multiple of 4).`,
    )
  }
}

export function reg(r: number): string {
  return `R${r}`
}
