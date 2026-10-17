import { describe, expect, it } from 'vitest'
import { computeMetrics } from '../shared/metrics.ts'
import { run } from './helpers.ts'

describe('performance equations', () => {
  it('computes CPI, IPC, frequency, execution time and throughput', () => {
    const m = computeMetrics({ totalCycles: 9, retiredInstructions: 5, stallCycles: 0, clockPeriodNs: 0.5 })
    expect(m.cpi).toBeCloseTo(9 / 5)
    expect(m.ipc).toBeCloseTo(5 / 9)
    expect(m.frequencyGHz).toBeCloseTo(2)
    expect(m.executionTimeNs).toBeCloseTo(4.5)
    expect(m.throughputIps).toBeCloseTo(5 / 4.5e-9, -3)
    expect(m.idealCycles).toBe(9)
    expect(m.fillDrainCycles).toBe(4)
  })

  it('rejects empty runs and non-positive clock periods', () => {
    expect(() => computeMetrics({ totalCycles: 0, retiredInstructions: 0, stallCycles: 0, clockPeriodNs: 1 })).toThrow()
    expect(() => computeMetrics({ totalCycles: 5, retiredInstructions: 1, stallCycles: 0, clockPeriodNs: 0 })).toThrow()
  })

  it('a faster clock can lose to fewer stalls: execution time, not CPI, decides', () => {
    const chain = ['ADD R1, R2, R3', 'SUB R4, R1, R5', 'AND R6, R4, R1', 'OR R7, R6, R4', 'XOR R8, R7, R6']
    const withFwd = run(chain, true, 0.6) // forwarding muxes lengthen the EX path (illustrative)
    const noFwd = run(chain, false, 0.5)
    expect(withFwd.metrics.cpi).toBeLessThan(noFwd.metrics.cpi)
    expect(withFwd.metrics.frequencyGHz).toBeLessThan(noFwd.metrics.frequencyGHz)
    expect(withFwd.metrics.executionTimeNs).toBeCloseTo(9 * 0.6)
    expect(noFwd.metrics.executionTimeNs).toBeCloseTo(17 * 0.5)
    expect(withFwd.metrics.executionTimeNs).toBeLessThan(noFwd.metrics.executionTimeNs)
  })

  it('clock period changes time-based metrics only', () => {
    const a = run(['LW R1, 0(R0)', 'ADD R2, R1, R1'], true, 1)
    const b = run(['LW R1, 0(R0)', 'ADD R2, R1, R1'], true, 0.25)
    expect(a.metrics.totalCycles).toBe(b.metrics.totalCycles)
    expect(a.metrics.cpi).toBe(b.metrics.cpi)
    expect(a.metrics.executionTimeNs / b.metrics.executionTimeNs).toBeCloseTo(4)
  })
})
