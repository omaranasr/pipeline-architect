import type { Metrics } from './types.ts'

export const PIPELINE_DEPTH = 5
export const FILL_DRAIN_CYCLES = PIPELINE_DEPTH - 1

/**
 * Performance equations used everywhere in the app:
 *   CPI = total cycles / retired instructions
 *   IPC = retired instructions / total cycles
 *   execution time (ns) = total cycles × clock period (ns)
 *   frequency (GHz) = 1 / clock period (ns)
 *   throughput (instr/s) = retired instructions / execution time (s)
 */
export function computeMetrics(input: {
  totalCycles: number
  retiredInstructions: number
  stallCycles: number
  clockPeriodNs: number
}): Metrics {
  const { totalCycles, retiredInstructions, stallCycles, clockPeriodNs } = input
  if (totalCycles <= 0 || retiredInstructions <= 0) throw new Error('metrics require a non-empty run')
  if (!(clockPeriodNs > 0)) throw new Error('clock period must be positive')
  const executionTimeNs = totalCycles * clockPeriodNs
  return {
    totalCycles,
    retiredInstructions,
    stallCycles,
    idealCycles: retiredInstructions + FILL_DRAIN_CYCLES,
    fillDrainCycles: FILL_DRAIN_CYCLES,
    cpi: totalCycles / retiredInstructions,
    ipc: retiredInstructions / totalCycles,
    clockPeriodNs,
    frequencyGHz: 1 / clockPeriodNs,
    executionTimeNs,
    throughputIps: retiredInstructions / (executionTimeNs * 1e-9),
  }
}
