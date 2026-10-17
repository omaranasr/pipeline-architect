import { useCallback, useEffect, useState } from 'react'
import { ApiError, simulateOnServer, type SimulateRequest, type SimulateResponse } from './api.ts'

export interface SimulationState {
  data: SimulateResponse | null
  loading: boolean
  error: ApiError | null
  /** Re-sends the current request. */
  rerun: () => void
}

/**
 * Calls POST /api/simulate whenever `request` changes (by value). Older in-flight requests are
 * aborted so a slow response can never overwrite a newer one.
 */
export function useSimulation(request: SimulateRequest | null, debounceMs = 0): SimulationState {
  const [data, setData] = useState<SimulateResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [nonce, setNonce] = useState(0)
  // Serialised request: effects re-run only when its value changes, not its identity.
  const key = request ? JSON.stringify(request) : null

  useEffect(() => {
    if (key === null) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLoading(true)
      simulateOnServer(JSON.parse(key) as SimulateRequest, controller.signal)
        .then((r) => {
          setData(r)
          setError(null)
        })
        .catch((e: unknown) => {
          if ((e as Error).name === 'AbortError') return
          setError(e instanceof ApiError ? e : new ApiError(0, (e as Error).message))
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, debounceMs)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [key, nonce, debounceMs])

  const rerun = useCallback(() => setNonce((n) => n + 1), [])
  return { data, loading, error, rerun }
}
