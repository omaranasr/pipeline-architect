import type { SimulateRequest } from '../lib/api.ts'

export interface LabConfig {
  workloadId: string
  /** Validated custom program (only used when workloadId === 'custom'). */
  customInstructions: string[]
  forwardingEnabled: boolean
  clockPeriodNs: number
}

export const SPEEDS = [0.5, 1, 2, 4] as const

export function toRequest(c: LabConfig): SimulateRequest {
  return c.workloadId === 'custom'
    ? { workloadId: 'custom', instructions: c.customInstructions, forwardingEnabled: c.forwardingEnabled, clockPeriodNs: c.clockPeriodNs }
    : { workloadId: c.workloadId, forwardingEnabled: c.forwardingEnabled, clockPeriodNs: c.clockPeriodNs }
}
