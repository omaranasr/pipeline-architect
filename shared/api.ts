import { SimulationError } from './isa.ts'
import { simulate } from './simulator.ts'
import { MAX_REQUEST_BYTES, validateSimulateRequest } from './validation.ts'

// Runtime-agnostic HTTP handlers (standard Fetch API Request/Response), wrapped by the
// Cloudflare Pages Functions in /functions/api and exercised directly by the tests.

export const API_VERSION = '1.0.0'

const SECURITY_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

export function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...SECURITY_HEADERS, ...extra } })
}

export function errorResponse(status: number, error: string, details: string[] = []): Response {
  return json(status, { error, details })
}

export function handleHealth(request: Request): Response {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return errorResponse(405, 'method not allowed', ['use GET'])
  }
  return json(200, {
    status: 'ok',
    service: 'pipeline-architect-api',
    version: API_VERSION,
    time: new Date().toISOString(),
    runtime: typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : 'unknown',
  })
}

export async function handleSimulate(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse(405, 'method not allowed', ['use POST with a JSON body'])
  }
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) {
    return errorResponse(415, 'unsupported media type', ['Content-Type must be application/json'])
  }
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > MAX_REQUEST_BYTES) {
    return errorResponse(413, 'request too large', [`maximum body size is ${MAX_REQUEST_BYTES} bytes`])
  }
  const text = await request.text()
  if (text.length > MAX_REQUEST_BYTES) {
    return errorResponse(413, 'request too large', [`maximum body size is ${MAX_REQUEST_BYTES} bytes`])
  }
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return errorResponse(400, 'malformed JSON', ['the request body is not valid JSON'])
  }
  const v = validateSimulateRequest(body)
  if (!v.ok) return errorResponse(400, 'invalid request', v.errors)

  try {
    const result = simulate(v.value.program, {
      workloadId: v.value.workloadId,
      forwardingEnabled: v.value.forwardingEnabled,
      clockPeriodNs: v.value.clockPeriodNs,
    })
    return json(200, { ...result, customInstructions: v.value.customInstructions, apiVersion: API_VERSION })
  } catch (e) {
    if (e instanceof SimulationError) {
      return errorResponse(422, 'simulation error', [e.message])
    }
    console.error('simulate failed', e)
    return errorResponse(500, 'internal error', ['the simulator failed unexpectedly'])
  }
}
