// Any other /api/* path returns a JSON 404 instead of falling through to the SPA's index.html.
import { errorResponse } from '../../shared/api.ts'

export const onRequest = (context: { request: Request }): Response | Promise<Response> =>
  errorResponse(404, 'not found', [`no API route for ${new URL(context.request.url).pathname}`])
