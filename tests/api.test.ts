import { describe, expect, it } from 'vitest'
import { onRequest as catchAll } from '../functions/api/[[catchall]].ts'
import { onRequest as health } from '../functions/api/health.ts'
import { onRequest as simulateFn } from '../functions/api/simulate.ts'
import type { SimulationResult } from '../shared/types.ts'

// The Pages Functions are invoked directly with a minimal EventContext.
type Ctx = Parameters<typeof simulateFn>[0]
const ctx = (request: Request) => ({ request }) as unknown as Ctx

function post(body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) {
  return new Request('http://localhost/api/simulate', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function call(req: Request) {
  const res = await simulateFn(ctx(req))
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await health(ctx(new Request('http://localhost/api/health')))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ok', service: 'pipeline-architect-api' })
  })
  it('rejects POST', async () => {
    const res = await health(ctx(new Request('http://localhost/api/health', { method: 'POST' })))
    expect(res.status).toBe(405)
  })
})

describe('POST /api/simulate', () => {
  it('simulates a predefined workload on the server', async () => {
    const { status, body } = await call(post({ workloadId: 'dependent-alu', forwardingEnabled: true, clockPeriodNs: 0.5 }))
    expect(status).toBe(200)
    const r = body as unknown as SimulationResult
    expect(r.metrics).toMatchObject({ totalCycles: 9, retiredInstructions: 5, stallCycles: 0, frequencyGHz: 2, executionTimeNs: 4.5 })
    expect(r.cycles).toHaveLength(9)
    expect(r.assumptions.forwarding).toMatch(/enabled/)
    expect(r.config).toEqual({ workloadId: 'dependent-alu', forwardingEnabled: true, clockPeriodNs: 0.5 })
  })

  it('simulates custom instructions and returns normalised text', async () => {
    const { status, body } = await call(
      post({ workloadId: 'custom', instructions: ['lw r1, 0(r0)', 'add r2, r1, r3'], forwardingEnabled: true }),
    )
    expect(status).toBe(200)
    expect(body.customInstructions).toEqual(['LW R1, 0(R0)', 'ADD R2, R1, R3'])
    expect((body as unknown as SimulationResult).metrics.stallCycles).toBe(1)
    expect((body as unknown as SimulationResult).metrics.clockPeriodNs).toBe(0.5) // default
  })

  it.each([
    ['not an object', [1, 2]],
    ['missing forwarding flag', { workloadId: 'independent' }],
    ['non-boolean forwarding', { workloadId: 'independent', forwardingEnabled: 'yes' }],
    ['unknown workload', { workloadId: 'nope', forwardingEnabled: true }],
    ['clock too small', { workloadId: 'independent', forwardingEnabled: true, clockPeriodNs: 0.01 }],
    ['clock too large', { workloadId: 'independent', forwardingEnabled: true, clockPeriodNs: 1e6 }],
    ['clock not a number', { workloadId: 'independent', forwardingEnabled: true, clockPeriodNs: '1' }],
    ['unknown field', { workloadId: 'independent', forwardingEnabled: true, metrics: { cpi: 1 } }],
    ['bad instruction', { instructions: ['MUL R1, R2, R3'], forwardingEnabled: true }],
    ['too many instructions', { instructions: Array(33).fill('NOP'), forwardingEnabled: true }],
    ['empty program', { instructions: [], forwardingEnabled: true }],
    ['instructions not strings', { instructions: [42], forwardingEnabled: true }],
    ['overlong line', { instructions: ['NOP' + ' '.repeat(70)], forwardingEnabled: true }],
    ['workloadId conflicts with instructions', { workloadId: 'independent', instructions: ['NOP'], forwardingEnabled: true }],
  ])('rejects %s with 400', async (_name, payload) => {
    const { status, body } = await call(post(payload))
    expect(status).toBe(400)
    expect(body.error).toBe('invalid request')
    expect((body.details as string[]).length).toBeGreaterThan(0)
  })

  it('rejects malformed JSON with 400', async () => {
    const { status, body } = await call(post('{"workloadId": '))
    expect(status).toBe(400)
    expect(body.error).toBe('malformed JSON')
  })

  it('rejects non-JSON content type with 415', async () => {
    const { status } = await call(post({ workloadId: 'independent', forwardingEnabled: true }, { 'content-type': 'text/plain' }))
    expect(status).toBe(415)
  })

  it('rejects oversized bodies with 413', async () => {
    const { status } = await call(post({ workloadId: 'independent', forwardingEnabled: true, pad: 'x'.repeat(20000) }))
    expect(status).toBe(413)
  })

  it('rejects GET with 405', async () => {
    const { status } = await call(new Request('http://localhost/api/simulate'))
    expect(status).toBe(405)
  })

  it('reports runtime memory faults with 422', async () => {
    const { status, body } = await call(post({ instructions: ['LW R1, 2(R0)'], forwardingEnabled: true }))
    expect(status).toBe(422)
    expect((body.details as string[])[0]).toMatch(/word-aligned/)
  })

  it('unknown API paths return JSON 404', async () => {
    const res = await catchAll(ctx(new Request('http://localhost/api/nothing')))
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toMatch(/json/)
  })
})
