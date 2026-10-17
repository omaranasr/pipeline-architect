import { MAX_INSTRUCTIONS, MAX_LINE_LENGTH } from '../../shared/isa.ts'
import { parseSource } from '../../shared/parser.ts'
import { isValidClockPeriod } from '../../shared/validation.ts'
import { CUSTOM_WORKLOAD_ID, WORKLOAD_IDS } from '../../shared/workloads.ts'

/** Firestore document: users/{uid}/experiments/{experimentId} (createdAt is a server timestamp). */
export interface ExperimentInput {
  name: string
  workloadId: string
  /** Newline-separated, parser-normalised instructions for custom workloads; null otherwise. */
  customInstructions: string | null
  forwardingEnabled: boolean
  clockPeriodNs: number
}

export interface Experiment extends ExperimentInput {
  id: string
  createdAt: Date | null
}

export const MAX_NAME_LENGTH = 80
export const MAX_CUSTOM_CHARS = MAX_INSTRUCTIONS * (MAX_LINE_LENGTH + 1)

/** Client-side mirror of the checks in firestore.rules (the rules remain authoritative). */
export function validateExperimentInput(x: ExperimentInput): string | null {
  const name = x.name.trim()
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return `Name must be 1–${MAX_NAME_LENGTH} characters.`
  if (x.workloadId !== CUSTOM_WORKLOAD_ID && !WORKLOAD_IDS.includes(x.workloadId)) return 'Unknown workload.'
  if (x.workloadId === CUSTOM_WORKLOAD_ID) {
    if (!x.customInstructions) return 'Custom program is empty.'
    if (x.customInstructions.length > MAX_CUSTOM_CHARS) return 'Custom program is too long.'
    if (!parseSource(x.customInstructions).ok) return 'Custom program does not parse.'
  } else if (x.customInstructions !== null) return 'Only custom workloads store instructions.'
  if (!isValidClockPeriod(x.clockPeriodNs)) return 'Clock period is out of range.'
  return null
}
