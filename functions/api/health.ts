// GET /api/health — Cloudflare Pages Function
import { handleHealth } from '../../shared/api.ts'

export const onRequest = (context: { request: Request }): Response | Promise<Response> => handleHealth(context.request)
