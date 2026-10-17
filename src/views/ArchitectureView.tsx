import { useCallback, useEffect, useState } from 'react'
import { firebaseConfigured, useEmulators } from '../firebase/config.ts'
import { fetchHealth, type HealthResponse } from '../lib/api.ts'
import { useLab } from '../state/SimulationContext.tsx'
import { PageHeader, Panel } from './common.tsx'

function Box({ x, y, w, h, title, sub, color }: { x: number; y: number; w: number; h: number; title: string; sub: string[]; color: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={12} fill="#0d1424" stroke={color} strokeOpacity={0.7} />
      <rect x={x} y={y} width={w} height={4} rx={2} fill={color} />
      <text x={x + 14} y={y + 26} fontSize={14} fontWeight={700} fill={color}>
        {title}
      </text>
      {sub.map((s, i) => (
        <text key={i} x={x + 14} y={y + 46 + i * 16} fontSize={11} fill="#9aa8c2">
          {s}
        </text>
      ))}
    </g>
  )
}

function Arrow({ d, label, lx, ly, color = '#64738f', dashed = false }: { d: string; label: string; lx: number; ly: number; color?: string; dashed?: boolean }) {
  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeDasharray={dashed ? '6 4' : undefined} markerEnd="url(#arch-arrow)" />
      <text x={lx} y={ly} fontSize={10.5} fill="#cbd5e1" textAnchor="middle" fontFamily="JetBrains Mono">
        {label}
      </text>
    </g>
  )
}

function ArchitectureDiagram() {
  return (
    <svg viewBox="0 0 1000 430" className="w-full min-w-[760px]" role="img" aria-label="System architecture diagram">
      <defs>
        <marker id="arch-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#94a3b8" />
        </marker>
      </defs>
      <Box x={20} y={150} w={210} h={120} title="Browser" sub={['React + TypeScript (Vite)', 'Tailwind CSS UI', 'Firebase Web SDK', 'No local simulation']} color="#22d3ee" />
      <Box x={330} y={30} w={300} h={110} title="Cloudflare Pages (CDN)" sub={['Static assets from dist/', 'HTTPS on *.pages.dev or custom domain', 'Global edge cache']} color="#fbbf24" />
      <Box x={330} y={175} w={300} h={120} title="Pages Functions (/api)" sub={['GET  /api/health', 'POST /api/simulate', 'Input validation + error codes', 'Workers runtime at the edge']} color="#fbbf24" />
      <Box x={720} y={175} w={260} h={120} title="Shared TS engine" sub={['shared/simulator.ts', 'parser · metrics · reference', 'Same code runs in Vitest', 'Deterministic & stateless']} color="#e879f9" />
      <Box x={330} y={320} w={300} h={95} title="Firebase Authentication" sub={['Google Sign-In (popup)', 'ID tokens held by the SDK']} color="#34d399" />
      <Box x={720} y={320} w={260} h={95} title="Cloud Firestore" sub={['users/{uid}/experiments', 'firestore.rules: owner only']} color="#34d399" />
      <Box x={720} y={30} w={260} h={110} title="GitHub" sub={['Source of truth (main)', 'Push → Cloudflare build', 'npm run build → dist/']} color="#60a5fa" />

      <Arrow d="M 230 180 C 280 150, 290 100, 328 90" label="GET /, assets" lx={262} ly={118} />
      <Arrow d="M 230 215 H 328" label="POST /api/simulate" lx={280} ly={208} color="#fbbf24" />
      <Arrow d="M 328 245 H 232" label="JSON trace + metrics" lx={280} ly={262} color="#fbbf24" />
      <Arrow d="M 630 235 H 718" label="simulate()" lx={674} ly={228} color="#e879f9" />
      <Arrow d="M 200 270 C 230 340, 280 360, 328 365" label="sign in" lx={250} ly={350} color="#34d399" />
      <Arrow d="M 150 270 C 200 425, 600 430, 718 390" label="read/write own experiments (SDK + rules)" lx={460} ly={424} color="#34d399" dashed />
      <Arrow d="M 718 85 H 632" label="deploy" lx={675} ly={78} color="#60a5fa" />
    </svg>
  )
}

export function ArchitectureView() {
  const { data } = useLab()
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthErr, setHealthErr] = useState<string | null>(null)
  const [latency, setLatency] = useState<number | null>(null)

  const check = useCallback(() => {
    const t0 = performance.now()
    fetchHealth()
      .then((h) => {
        setHealth(h)
        setHealthErr(null)
        setLatency(performance.now() - t0)
      })
      .catch((e: Error) => setHealthErr(e.message))
  }, [])
  useEffect(check, [check])

  return (
    <div className="space-y-4">
      <PageHeader index={6} title="Architecture & Assumptions">
        How the pieces of a modern full-stack application fit together here, and every assumption behind the simulation model.
      </PageHeader>

      <Panel title="System architecture">
        <div className="overflow-x-auto">
          <ArchitectureDiagram />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Frontend">
          <p className="text-sm text-dim">
            A single-page React app compiled by Vite into static HTML, JS and CSS. It renders the server’s trace, never computes it. Hash routing
            (<code className="font-mono text-xs">#/timeline</code>) works on any static host.
          </p>
        </Panel>
        <Panel title="Backend">
          <p className="text-sm text-dim">
            Cloudflare Pages Functions in <code className="font-mono text-xs">functions/api</code> are deployed with the site and run on the
            Workers runtime. They validate input, run the shared TypeScript engine and return JSON.
          </p>
        </Panel>
        <Panel title="Data & identity">
          <p className="text-sm text-dim">
            Firebase Authentication proves who the user is; Firestore stores only experiment configurations. Security rules check{' '}
            <code className="font-mono text-xs">request.auth.uid</code> on every read and write, so the browser can talk to the database
            directly and safely.
          </p>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Live API status"
          right={
            <button className="btn px-2 py-1 text-xs" onClick={check}>
              Check again
            </button>
          }
        >
          {healthErr ? (
            <p className="text-sm text-rose-300">/api/health failed: {healthErr}</p>
          ) : health ? (
            <dl className="grid grid-cols-2 gap-y-1 font-mono text-xs">
              <dt className="text-faint">status</dt>
              <dd className="text-emerald-300">{health.status}</dd>
              <dt className="text-faint">service</dt>
              <dd>{health.service}</dd>
              <dt className="text-faint">version</dt>
              <dd>{health.version}</dd>
              <dt className="text-faint">server time</dt>
              <dd>{health.time}</dd>
              <dt className="text-faint">round trip</dt>
              <dd>{latency !== null ? `${latency.toFixed(0)} ms` : '—'}</dd>
              <dt className="text-faint">Firebase</dt>
              <dd>{useEmulators ? 'local emulators' : firebaseConfigured ? 'configured' : 'not configured'}</dd>
            </dl>
          ) : (
            <p className="text-sm text-faint">Checking…</p>
          )}
        </Panel>
        <Panel title="REST API">
          <pre className="overflow-x-auto rounded-lg bg-ink-900 p-3 font-mono text-[11px] leading-5 text-dim">{`POST /api/simulate
Content-Type: application/json

{ "workloadId": "dependent-alu",
  "forwardingEnabled": true,
  "clockPeriodNs": 0.5 }

{ "workloadId": "custom",
  "instructions": ["LW R1, 0(R0)", "ADD R2, R1, R1"],
  "forwardingEnabled": false }

200 → { metrics, cycles[], instructions[], assumptions,
        finalRegisters, memory, architecturalCheck }
400 invalid input · 413 too large · 415 not JSON
422 memory fault at run time · 405 wrong method`}</pre>
        </Panel>
      </div>

      <Panel title="Performance equations">
        <div className="grid gap-2 font-mono text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['CPI', 'total cycles / retired instructions'],
            ['IPC', 'retired instructions / total cycles'],
            ['Execution time', 'total cycles × clock period'],
            ['Frequency (GHz)', '1 / clock period (ns)'],
            ['Throughput', 'retired instructions / execution time'],
            ['Ideal cycles', 'N + 4 (fill + drain)'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-line bg-ink-850 p-3">
              <div className="text-xs text-cyan-300">{k}</div>
              <div className="text-dim">{v}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Simulation assumptions (returned by the server)">
        {data ? (
          <dl className="space-y-3 text-sm">
            {(
              [
                ['Model', data.assumptions.model],
                ['Issue', data.assumptions.issue],
                ['Forwarding', data.assumptions.forwarding],
                ['Hazard policy', data.assumptions.hazardPolicy],
                ['Register file', data.assumptions.registerFile],
                ['Memory', data.assumptions.memory],
                ['Initial state', data.assumptions.initialState],
                ['Clock', data.assumptions.clock],
                ['Not modelled', data.assumptions.notModelled.join(' · ')],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="grid gap-1 sm:grid-cols-[160px_1fr]">
                <dt className="text-xs font-semibold uppercase tracking-wider text-faint">{k}</dt>
                <dd className="text-dim">{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-faint">Run a simulation to load the assumptions from the API.</p>
        )}
      </Panel>
    </div>
  )
}
