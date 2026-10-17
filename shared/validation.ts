import { MAX_INSTRUCTIONS, MAX_LINE_LENGTH } from './isa.ts'
import { parseInstructionList } from './parser.ts'
import type { Instruction } from './types.ts'
import { CUSTOM_WORKLOAD_ID, findWorkload, WORKLOAD_IDS } from './workloads.ts'

export const CLOCK_PERIOD_MIN_NS = 0.1
export const CLOCK_PERIOD_MAX_NS = 100
export const DEFAULT_CLOCK_PERIOD_NS = 0.5
export const MAX_REQUEST_BYTES = 16 * 1024

const ALLOWED_KEYS = new Set(['workloadId', 'instructions', 'forwardingEnabled', 'clockPeriodNs'])

export interface ValidSimulateRequest {
  workloadId: string
  program: Instruction[]
  /** Normalised instruction strings for custom workloads (null for predefined workloads). */
  customInstructions: string[] | null
  forwardingEnabled: boolean
  clockPeriodNs: number
}

export type ValidationResult = { ok: true; value: ValidSimulateRequest } | { ok: false; errors: string[] }

export function isValidClockPeriod(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= CLOCK_PERIOD_MIN_NS && v <= CLOCK_PERIOD_MAX_NS
}

/**
 * Validates the JSON body of POST /api/simulate.
 *   { "workloadId": "dependent-alu", "forwardingEnabled": true, "clockPeriodNs": 0.5 }
 *   { "workloadId": "custom", "instructions": ["LW R1, 0(R0)", "ADD R2, R1, R1"], "forwardingEnabled": false }
 */
export function validateSimulateRequest(body: unknown): ValidationResult {
  const errors: string[] = []
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, errors: ['request body must be a JSON object'] }
  }
  const obj = body as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_KEYS.has(key)) errors.push(`unknown field "${key}"`)
  }

  if (typeof obj.forwardingEnabled !== 'boolean') errors.push('"forwardingEnabled" must be a boolean')

  let clockPeriodNs = DEFAULT_CLOCK_PERIOD_NS
  if (obj.clockPeriodNs !== undefined) {
    if (!isValidClockPeriod(obj.clockPeriodNs)) {
      errors.push(`"clockPeriodNs" must be a number between ${CLOCK_PERIOD_MIN_NS} and ${CLOCK_PERIOD_MAX_NS}`)
    } else {
      clockPeriodNs = obj.clockPeriodNs
    }
  }

  let workloadId = ''
  let program: Instruction[] = []
  let customInstructions: string[] | null = null
  if (obj.instructions !== undefined) {
    if (obj.workloadId !== undefined && obj.workloadId !== CUSTOM_WORKLOAD_ID) {
      errors.push(`"workloadId" must be "${CUSTOM_WORKLOAD_ID}" (or omitted) when "instructions" is provided`)
    }
    const list = obj.instructions
    if (!Array.isArray(list) || !list.every((s) => typeof s === 'string')) {
      errors.push('"instructions" must be an array of strings')
    } else if (list.length === 0 || list.length > MAX_INSTRUCTIONS) {
      errors.push(`"instructions" must contain 1 to ${MAX_INSTRUCTIONS} entries`)
    } else if (list.some((s) => s.length > MAX_LINE_LENGTH)) {
      errors.push(`each instruction must be at most ${MAX_LINE_LENGTH} characters`)
    } else {
      const parsed = parseInstructionList(list)
      if (parsed.ok) {
        program = parsed.instructions
        customInstructions = program.map((i) => i.text)
        workloadId = CUSTOM_WORKLOAD_ID
      } else {
        for (const e of parsed.errors) errors.push(e.line > 0 ? `instruction ${e.line}: ${e.message}` : e.message)
      }
    }
  } else if (typeof obj.workloadId !== 'string') {
    errors.push(`provide "workloadId" (one of ${WORKLOAD_IDS.join(', ')}) or an "instructions" array`)
  } else {
    const w = findWorkload(obj.workloadId)
    if (!w) {
      errors.push(`unknown workloadId (expected one of ${WORKLOAD_IDS.join(', ')}, or "${CUSTOM_WORKLOAD_ID}" with "instructions")`)
    } else {
      const parsed = parseInstructionList(w.instructions)
      if (!parsed.ok) throw new Error(`built-in workload ${w.id} failed to parse`)
      program = parsed.instructions
      workloadId = w.id
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: { workloadId, program, customInstructions, forwardingEnabled: obj.forwardingEnabled as boolean, clockPeriodNs },
  }
}
