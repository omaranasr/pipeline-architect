import { lazy, Suspense, useState } from 'react'
import { AuthControl } from './components/AuthControl.tsx'
import { useAuth } from './firebase/AuthContext.tsx'
import { navigate, ROUTES, useRoute, type RouteId } from './lib/router.ts'
import { ArchitectureView } from './views/ArchitectureView.tsx'
import { DatapathView } from './views/DatapathView.tsx'
import { ExperimentsView } from './views/ExperimentsView.tsx'
import { HazardView } from './views/HazardView.tsx'
import { HomeView } from './views/HomeView.tsx'
import { PerformanceView } from './views/PerformanceView.tsx'
import { TimelineView } from './views/TimelineView.tsx'

const PresentationMode = lazy(() => import('./presentation/PresentationMode.tsx'))

function Logo() {
  return (
    <a href="#/home" className="flex items-center gap-2.5" aria-label="Pipeline Architect home">
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <rect width="32" height="32" rx="7" fill="#0d1424" stroke="#1f2a44" />
        {['#22d3ee', '#60a5fa', '#fbbf24', '#e879f9', '#34d399'].map((c, i) => (
          <rect key={c} x={4 + i * 5} y={9 + (i % 2) * 2} width={3.4} height={14 - (i % 2) * 4} rx={1.2} fill={c} />
        ))}
      </svg>
      <div className="leading-tight">
        <div className="text-sm font-bold tracking-tight">Pipeline Architect</div>
        <div className="hidden text-[10px] uppercase tracking-[0.18em] text-faint sm:block">CPU Microarchitecture Lab</div>
      </div>
    </a>
  )
}

const VIEWS: Record<RouteId, () => React.JSX.Element> = {
  home: HomeView,
  datapath: DatapathView,
  timeline: TimelineView,
  hazards: HazardView,
  performance: PerformanceView,
  experiments: ExperimentsView,
  architecture: ArchitectureView,
}

export default function App() {
  const route = useRoute()
  const [presenting, setPresenting] = useState(false)
  const auth = useAuth()
  const View = VIEWS[route]
  const nav = ROUTES.filter((r) => r.id !== 'home')

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-ink-900/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-2.5">
          <Logo />
          <nav className="hidden flex-1 items-center gap-0.5 xl:flex" aria-label="Main">
            {nav.map((r, i) => (
              <a
                key={r.id}
                href={`#/${r.id}`}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm transition ${route === r.id ? 'bg-ink-700 text-fg' : 'text-dim hover:text-fg'}`}
                aria-current={route === r.id ? 'page' : undefined}
                title={r.label}
              >
                <span className="mr-1 font-mono text-[10px] text-faint">{i + 1}</span>
                <span className="2xl:hidden">{r.short}</span>
                <span className="hidden 2xl:inline">{r.label}</span>
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 xl:ml-0">
            {auth.emulator && <span className="chip border-amber-400/40 text-amber-300">emulator</span>}
            <button className="btn btn-primary px-2.5 py-1 text-sm" onClick={() => setPresenting(true)} title="Guided presentation (full screen)">
              ▶ Present
            </button>
            <AuthControl />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 xl:hidden" aria-label="Main (compact)">
          {nav.map((r) => (
            <button
              key={r.id}
              onClick={() => navigate(r.id)}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-xs ${route === r.id ? 'bg-ink-700 text-fg' : 'text-dim'}`}
            >
              {r.short}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-5">
        <View />
      </main>

      <footer className="mx-auto max-w-[1500px] px-4 pb-8 pt-4 text-xs text-faint">
        Educational model of a classic five-stage pipeline. Clock periods are illustrative assumptions, not silicon measurements. Simulation runs on
        the server (Cloudflare Pages Functions).
      </footer>

      {presenting && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-ink-950" />}>
          <PresentationMode onExit={() => setPresenting(false)} />
        </Suspense>
      )}
    </div>
  )
}
