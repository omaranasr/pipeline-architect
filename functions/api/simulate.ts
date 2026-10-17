// POST /api/simulate — Cloudflare Pages Function.
// Validates the request, runs the deterministic pipeline simulator on the server and
// returns the full per-cycle trace, metrics and assumptions.
import { handleSimulate } from '../../shared/api.ts'

export const onRequest = (context: { request: Request }): Response | Promise<Response> => handleSimulate(context.request)
