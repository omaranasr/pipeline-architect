import type { ApiError } from '../lib/api.ts'

export function ApiErrorPanel({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-rose-200">
            {error.status ? `API error ${error.status}: ` : ''}
            {error.message}
          </p>
          {error.details.map((d, i) => (
            <p key={i} className="mt-1 font-mono text-xs text-rose-200/80">
              {d}
            </p>
          ))}
          <p className="mt-2 text-xs text-dim">The simulation runs only on the server; no client-side fallback is used.</p>
        </div>
        {onRetry && (
          <button className="btn shrink-0" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    </div>
  )
}

export function LoadingPill({ show, label = 'Simulating on server…' }: { show: boolean; label?: string }) {
  if (!show) return null
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-xs text-cyan-200" aria-live="polite">
      <span className="h-2 w-2 animate-ping rounded-full bg-cyan-300" />
      {label}
    </span>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-ink-700/60 ${className}`} />
}
