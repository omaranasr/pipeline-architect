import type { SimulationResult } from '../../shared/types.ts'

// Client for the REST API served by Cloudflare Pages Functions. There is deliberately no
// client-side simulation fallback: if the API is unreachable the UI shows an error.

export interface SimulateRequest {
  workloadId: string
  instructions?: string[]
  forwardingEnabled: boolean
  clockPeriodNs: number
}

export interface SimulateResponse extends SimulationResult {
  customInstructions: string[] | null
  apiVersion: string
}

export class ApiError extends Error {
  readonly status: number
  readonly details: string[]
  constructor(status: number, message: string, details: string[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

async function readError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: string; details?: string[] }
    return new ApiError(res.status, body.error ?? `HTTP ${res.status}`, body.details ?? [])
  } catch {
    return new ApiError(res.status, `HTTP ${res.status} ${res.statusText}`)
  }
}

export async function simulateOnServer(req: SimulateRequest, signal?: AbortSignal): Promise<SimulateResponse> {
  const body: Record<string, unknown> = { forwardingEnabled: req.forwardingEnabled, clockPeriodNs: req.clockPeriodNs }
  if (req.workloadId === 'custom') {
    body.workloadId = 'custom'
    body.instructions = req.instructions ?? []
  } else {
    body.workloadId = req.workloadId
  }
  let res: Response
  try {
    res = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, 'Cannot reach the simulation API', [
      'POST /api/simulate failed at the network level. Locally, start the API with `npm run dev` (Vite + Wrangler).',
    ])
  }
  if (!res.ok) throw await readError(res)
  const type = res.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) {
    throw new ApiError(res.status, 'The API returned a non-JSON response', [
      'Is the Pages Functions backend running? A static file server cannot answer /api/simulate.',
    ])
  }
  return (await res.json()) as SimulateResponse
}

export interface HealthResponse {
  status: string
  service: string
  version: string
  time: string
  runtime: string
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch('/api/health', { signal })
  if (!res.ok) throw await readError(res)
  return (await res.json()) as HealthResponse
}
