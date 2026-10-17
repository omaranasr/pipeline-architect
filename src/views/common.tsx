import type { ReactNode } from 'react'
import type { SimulateResponse } from '../lib/api.ts'
import { ApiErrorPanel, Skeleton } from '../components/StatusBanner.tsx'
import { useLab } from '../state/SimulationContext.tsx'

export function PageHeader({ index, title, children }: { index?: number; title: string; children?: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline gap-3">
        {index !== undefined && <span className="font-mono text-xs text-cyan-400/80">0{index}</span>}
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      </div>
      {children && <p className="mt-1 max-w-3xl text-sm text-dim">{children}</p>}
    </div>
  )
}

export function Panel({ title, right, children, className = '' }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="panel-title">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

/** Renders children with the server result, or loading/error states. Never simulates locally. */
export function WithResult({ children }: { children: (data: SimulateResponse) => ReactNode }) {
  const { data, error, loading, rerun } = useLab()
  // On error the previous result is hidden so stale data is never presented as current.
  if (error) return <ApiErrorPanel error={error} onRetry={rerun} />
  if (!data) {
    return (
      <div className="space-y-3" aria-busy={loading}>
        <Skeleton className="h-12" />
        <Skeleton className="h-72" />
        <Skeleton className="h-40" />
      </div>
    )
  }
  return <>{children(data)}</>
}
