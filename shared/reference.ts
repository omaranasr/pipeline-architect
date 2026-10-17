import { aluCompute, checkAddress, initialMemoryValue, initialRegisters, isAlu, toInt32 } from './isa.ts'
import type { Instruction } from './types.ts'

/**
 * Sequential (non-pipelined) interpreter: executes one instruction completely before the next.
 * It defines the architectural semantics the pipeline must reproduce.
 */
export function runReference(program: readonly Instruction[]): { registers: number[]; memory: Map<number, number> } {
  const registers = initialRegisters()
  const memory = new Map<number, number>()
  const read = (a: number) => memory.get(a) ?? initialMemoryValue(a)
  for (const ins of program) {
    if (ins.op === 'NOP') continue
    if (isAlu(ins.op)) {
      const v = aluCompute(ins.op, registers[ins.rs1!], registers[ins.rs2!])
      if (ins.rd !== 0) registers[ins.rd!] = v
    } else if (ins.op === 'LW') {
      const addr = toInt32(registers[ins.rs1!] + ins.imm!)
      checkAddress(ins, addr)
      if (ins.rd !== 0) registers[ins.rd!] = read(addr)
    } else {
      const addr = toInt32(registers[ins.rs1!] + ins.imm!)
      checkAddress(ins, addr)
      memory.set(addr, registers[ins.rs2!])
    }
    registers[0] = 0
  }
  return { registers, memory }
}
