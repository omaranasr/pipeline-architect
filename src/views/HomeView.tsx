import { useEffect, useRef } from 'react'
import { WORKLOADS } from '../../shared/workloads.ts'
import { DatapathDiagram } from '../components/DatapathDiagram.tsx'
import { ApiErrorPanel, LoadingPill, Skeleton } from '../components/StatusBanner.tsx'
import { MatrixLegend, TimelineMatrix } from '../components/TimelineMatrix.tsx'
import { fmt } from '../lib/format.ts'
import { navigate, type RouteId } from '../lib/router.ts'
import { useLab } from '../state/SimulationContext.tsx'

export function HomeView() {
  const { data, error, loading, cycleIndex, setCycleIndex, playing, setPlaying, config, setConfig, rerun } = useLab()
  const started = useRef(false)

  // Start the live demo once, the first time a result is available on the landing page.
  useEffect(() => {
    if (data && !started.current) {
      started.current = true
      if (cycleIndex === 0) setPlaying(true)
    }
  }, [data, cycleIndex, setPlaying])

  const trace = data?.cycles[cycleIndex]

  const cards: { id: RouteId; n: number; title: string; body: string; stat: string }[] = [
    { id: 'datapath', n: 1, title: 'Datapath Explorer', body: 'Animated five-stage datapath with pipeline registers, hazard unit and forwarding muxes.', stat: data ? `${data.program.length} instructions in flight` : '' },
    { id: 'timeline', n: 2, title: 'Cycle Timeline', body: 'The full instruction × cycle matrix. Click any cycle for the complete machine state.', stat: data ? `${data.metrics.totalCycles} cycles` : '' },
    { id: 'hazards', n: 3, title: 'Hazard & Forwarding', body: 'Every RAW dependency and how it was resolved: bypass path, stall or register-file timing.', stat: data ? `${data.cycles.reduce((s, c) => s + c.forwards.length, 0)} forwards · ${data.metrics.stallCycles} stalls` : '' },
    { id: 'performance', n: 4, title: 'Performance Lab', body: 'CPI versus clock period: compare execution time and throughput with and without forwarding.', stat: data ? `CPI ${fmt(data.metrics.cpi, 2)} · ${fmt(data.metrics.executionTimeNs, 2)} ns` : '' },
    { id: 'experiments', n: 5, title: 'My Experiments', body: 'Sign in with Google to save configurations to Firestore and reopen them later.', stat: 'Firebase Auth + Firestore' },
    { id: 'architecture', n: 6, title: 'Architecture & Assumptions', body: 'How the frontend, REST API, database, auth, hosting and domain connect.', stat: 'Cloudflare Pages + Functions' },
  ]

  return (
    <div className="space-y-6">
      <section className="grid items-center gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="fade-up">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-cyan-300/80">Interactive CPU microarchitecture laboratory</p>
          <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            See every cycle of a{' '}
            <span className="bg-gradient-to-r from-cyan-300 via-sky-400 to-fuchsia-400 bg-clip-text text-transparent">five-stage pipeline</span>.
          </h1>
          <p className="mt-4 max-w-xl text-base text-dim">
            Step through IF, ID, EX, MEM and WB. Create read-after-write hazards, watch the hazard unit insert bubbles, switch on forwarding,
            and measure what it really buys you in execution time.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button className="btn btn-primary px-4 py-2 text-base" onClick={() => navigate('datapath')}>
              Open the Datapath Explorer →
            </button>
            <button className="btn px-4 py-2 text-base" onClick={() => navigate('timeline')}>
              Cycle timeline
            </button>
          </div>
          <div className="mt-6 flex flex-wrap gap-1.5">
            {WORKLOADS.map((w) => (
              <button
                key={w.id}
                onClick={() => {
                  setConfig({ workloadId: w.id })
                  started.current = false
                }}
                className={`chip px-2 py-1 text-xs ${config.workloadId === w.id ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-100' : 'border-line text-dim hover:text-fg'}`}
              >
                {w.label} · {w.title}
              </button>
            ))}
          </div>
        </div>

        <div className="panel relative overflow-hidden p-3 shadow-[0_0_80px_-30px_rgba(34,211,238,0.45)]">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <span className="flex items-center gap-2 text-xs text-dim">
              <span className={`h-2 w-2 rounded-full ${data ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              Live server simulation · forwarding {config.forwardingEnabled ? 'ON' : 'OFF'}
            </span>
            <div className="flex items-center gap-2">
              <LoadingPill show={loading} label="simulating…" />
              {data && (
                <>
                  <span className="font-mono text-xs text-dim">
                    cycle {cycleIndex + 1}/{data.cycles.length}
                  </span>
                  <button className="btn px-2 py-0.5 text-xs" onClick={() => setPlaying(!playing)}>
                    {playing ? '❚❚' : '▶'}
                  </button>
                  <button className="btn px-2 py-0.5 text-xs" onClick={() => setConfig({ forwardingEnabled: !config.forwardingEnabled })}>
                    toggle forwarding
                  </button>
                </>
              )}
            </div>
          </div>
          {error ? (
            <ApiErrorPanel error={error} onRetry={rerun} />
          ) : trace ? (
            <div className="overflow-x-auto">
              <div className="min-w-[640px] lg:min-w-0">
                <DatapathDiagram trace={trace} compact />
              </div>
              <p className="mt-1 min-h-[2.5rem] px-1 text-xs text-dim">{trace.explanation[0]}</p>
            </div>
          ) : (
            <Skeleton className="h-72" />
          )}
        </div>
      </section>

      {data && (
        <section className="panel p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="panel-title">Execution matrix · {data.program.length} instructions</h2>
            <MatrixLegend />
          </div>
          <TimelineMatrix result={data} cycleIndex={cycleIndex} onSelectCycle={(i) => { setPlaying(false); setCycleIndex(i) }} dense />
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <button key={c.id} onClick={() => navigate(c.id)} className="panel group p-4 text-left transition hover:border-cyan-400/40 hover:bg-ink-700/60">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xs text-cyan-400/80">0{c.n}</span>
              <span className="font-mono text-[11px] text-faint">{c.stat}</span>
            </div>
            <h3 className="mt-1 text-lg font-semibold group-hover:text-cyan-100">{c.title}</h3>
            <p className="mt-1 text-sm text-dim">{c.body}</p>
          </button>
        ))}
      </section>
    </div>
  )
}
