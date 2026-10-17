import { parseInstructionList } from '../shared/parser.ts'
import { simulate } from '../shared/simulator.ts'
import type { Instruction, SimulationResult } from '../shared/types.ts'

export function program(...lines: string[]): Instruction[] {
  const r = parseInstructionList(lines)
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r.instructions
}

export function run(lines: string[], forwardingEnabled: boolean, clockPeriodNs = 1): SimulationResult {
  return simulate(program(...lines), { workloadId: 'custom', forwardingEnabled, clockPeriodNs })
}

/** Stage occupied by an instruction in a 1-based cycle, e.g. "EX" or "ID*" (stalled). */
export function stageOf(r: SimulationResult, instrId: string, cycle: number): string {
  const s = r.instructions.find((i) => i.id === instrId)!.stageByCycle[cycle - 1]
  return s ? s.stage + (s.stalled ? '*' : '') : '-'
}

export function row(r: SimulationResult, instrId: string): string {
  return r.cycles.map((c) => stageOf(r, instrId, c.cycle)).join(' ')
}
