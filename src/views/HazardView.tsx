import { useMemo } from 'react'
import { sourceOperands, writesRegister } from '../../shared/isa.ts'
import type { SimulationResult } from '../../shared/types.ts'
import { ConfigPanel } from '../components/ConfigPanel.tsx'
import { PlaybackControls } from '../components/Playback.tsx'
import { LoadingPill } from '../components/StatusBanner.tsx'
import { useSimulation } from '../lib/useSimulation.ts'
import { toRequest } from '../state/labConfig.ts'
import { useLab } from '../state/SimulationContext.tsx'
import { PageHeader, Panel, WithResult } from './common.tsx'

interface Dependency {
  consumerId: string
  consumerText: string
  producerId: string
  producerText: string
  producerOp: string
  register: number
  role: string
  distance: number
  resolution: string[]
  stalls: number
}

/** RAW dependencies from the program text, annotated with how the server trace resolved each one. */
function analyse(result: SimulationResult): Dependency[] {
  const deps: Dependency[] = []
  const prog = result.program
  for (const c of prog) {
    for (const src of sourceOperands(c)) {
      if (src.register === 0) continue
      let p = null
      for (let i = c.index - 1; i >= 0; i--) {
        if (writesRegister(prog[i]) && prog[i].rd === src.register) {
          p = prog[i]
          break
        }
      }
      if (!p) continue
      const resolution: string[] = []
      let stalls = 0
      for (const cyc of result.cycles) {
        if (cyc.hazards.some((h) => h.consumerId === c.id && h.register === src.register)) stalls++
      }
      if (stalls) resolution.push(`stalled ${stalls} cycle${stalls > 1 ? 's' : ''}`)
      for (const cyc of result.cycles) {
        for (const f of cyc.forwards) {
          if (f.consumerId === c.id && f.register === src.register && f.operand === src.role) resolution.push(`forwarded ${f.path} (cycle ${cyc.cycle})`)
        }
        for (const b of cyc.registerFileBypasses) {
          if (b.consumerId === c.id && b.register === src.register) resolution.push(`same-cycle WB→ID register read (cycle ${cyc.cycle})`)
        }
      }
      if (resolution.length === 0 || (stalls && resolution.length === 1)) resolution.push('read from the register file after write-back')
      deps.push({
        consumerId: c.id,
        consumerText: c.text,
        producerId: p.id,
        producerText: p.text,
        producerOp: p.op,
        register: src.register,
        role: src.role,
        distance: c.index - p.index,
        resolution: [...new Set(resolution)],
        stalls,
      })
    }
  }
  return deps
}

export function HazardView() {
  const { config, cycleIndex } = useLab()
  const alt = useSimulation(toRequest({ ...config, forwardingEnabled: !config.forwardingEnabled }), 300)

  return (
    <div className="space-y-4">
      <PageHeader index={3} title="Hazard & Forwarding Analysis">
        Every read-after-write dependency in the program, and exactly how the pipeline resolved it in this run: a forwarding path, a stall,
        or the register file’s write-then-read timing.
      </PageHeader>
      <ConfigPanel />
      <WithResult>
        {(data) => <HazardBody data={data} alt={alt.data} altLoading={alt.loading} altError={alt.error?.message ?? null} cycleIndex={cycleIndex} />}
      </WithResult>
    </div>
  )
}

function HazardBody({
  data,
  alt,
  altLoading,
  altError,
  cycleIndex,
}: {
  data: SimulationResult
  alt: SimulationResult | null
  altLoading: boolean
  altError: string | null
  cycleIndex: number
}) {
  const deps = useMemo(() => analyse(data), [data])
  const trace = data.cycles[cycleIndex]
  const ex = trace.stages.EX
  const exIns = ex.kind === 'instr' ? data.program.find((p) => p.id === ex.instrId)! : null
  const events = data.cycles.filter((c) => c.stall || c.forwards.length || c.registerFileBypasses.length)
  const fwdOn = data.config.forwardingEnabled
  const on = fwdOn ? data : alt
  const off = fwdOn ? alt : data

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Forwarding on vs off (same program)" className="lg:col-span-1" right={<LoadingPill show={altLoading} label="server…" />}>
          {altError && <p className="text-sm text-rose-300">Comparison run failed: {altError}</p>}
          <div className="grid grid-cols-2 gap-2">
            {[
              ['Forwarding ON', on],
              ['Forwarding OFF', off],
            ].map(([label, r]) => {
              const res = r as SimulationResult | null
              return (
                <div key={label as string} className="rounded-lg border border-line bg-ink-850 p-3">
                  <div className="text-xs text-dim">{label as string}</div>
                  <div className="mt-1 font-mono text-2xl font-semibold text-fg">{res ? res.metrics.totalCycles : '…'}</div>
                  <div className="text-[11px] text-faint">cycles</div>
                  <div className={`mt-1 font-mono text-sm ${res && res.metrics.stallCycles ? 'text-rose-300' : 'text-emerald-300'}`}>
                    {res ? `${res.metrics.stallCycles} stall${res.metrics.stallCycles === 1 ? '' : 's'}` : ''}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-faint">Both columns are separate /api/simulate runs. Forwarding removes ALU→ALU stalls but cannot remove load-use stalls.</p>
        </Panel>

        <Panel title={`Forwarding unit · cycle ${trace.cycle}`} className="lg:col-span-2">
          {exIns ? (
            <div className="space-y-2 text-sm">
              <p className="text-dim">
                EX holds <span className="font-mono text-fg">{exIns.id} {exIns.text}</span>. Mux selections:
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {sourceOperands(exIns).map((s) => {
                  const f = trace.forwards.find((x) => x.operand === s.role)
                  return (
                    <div key={s.role} className={`rounded-lg border p-3 ${f ? 'border-orange-400/50 bg-orange-400/10' : 'border-line bg-ink-850'}`}>
                      <div className="text-xs text-faint">{s.role} · R{s.register}</div>
                      <div className="font-mono text-sm text-fg">
                        {s.register === 0 ? 'R0 → constant 0' : f ? `${f.path} from ${f.producerId} = ${f.value}` : 'ID/EX (register-file value)'}
                      </div>
                      {f && <div className="text-[11px] text-orange-200/80">stale register-file value was {f.staleValue}</div>}
                    </div>
                  )
                })}
                {exIns.op === 'NOP' && <p className="text-faint">NOP has no operands.</p>}
              </div>
              {!fwdOn && <p className="text-xs text-faint">Forwarding is disabled: the muxes always select the ID/EX value, so the hazard unit must stall instead.</p>}
            </div>
          ) : (
            <p className="text-sm text-faint">EX holds {ex.kind === 'bubble' ? 'a bubble' : 'nothing'} in this cycle; the forwarding muxes are idle.</p>
          )}
          <div className="mt-3 border-t border-line pt-3">
            <PlaybackControls keyboard />
          </div>
        </Panel>
      </div>

      <Panel title={`Read-after-write dependencies (${deps.length})`}>
        {deps.length === 0 ? (
          <p className="text-sm text-faint">No instruction reads a register written by an earlier instruction: there are no RAW hazards in this program.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-faint">
                  <th className="py-2 pr-3">Producer</th>
                  <th className="py-2 pr-3">Consumer</th>
                  <th className="py-2 pr-3">Register</th>
                  <th className="py-2 pr-3">Distance</th>
                  <th className="py-2">Resolution in this run</th>
                </tr>
              </thead>
              <tbody>
                {deps.map((d, i) => (
                  <tr key={i} className="border-t border-line align-top">
                    <td className="py-2 pr-3 font-mono text-xs">
                      <span className="font-bold">{d.producerId}</span> <span className="text-dim">{d.producerText}</span>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      <span className="font-bold">{d.consumerId}</span> <span className="text-dim">{d.consumerText}</span>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      R{d.register} <span className="text-faint">({d.role})</span>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{d.distance}</td>
                    <td className="py-2 text-xs">
                      {d.stalls > 0 && (
                        <span className="chip mr-1 border-rose-400/50 text-rose-300">
                          {d.producerOp === 'LW' && fwdOn ? 'load-use' : 'stall'} ×{d.stalls}
                        </span>
                      )}
                      {d.resolution.map((r, j) => (
                        <span key={j} className="mr-2 text-dim">
                          {r}
                          {j < d.resolution.length - 1 ? ';' : ''}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Hazard & forwarding event log">
        <ol className="space-y-2">
          {events.length === 0 && <li className="text-sm text-faint">No hazard, forwarding or same-cycle register events in this run.</li>}
          {events.map((c) => (
            <li key={c.cycle} className="flex gap-3 text-sm">
              <span className={`chip h-fit shrink-0 ${c.stall ? 'border-rose-400/50 text-rose-300' : 'border-orange-400/40 text-orange-300'}`}>cycle {c.cycle}</span>
              <div className="space-y-0.5 text-dim">
                {c.explanation
                  .filter((l) => /hazard|Stall|Forwarding|write-then-read/.test(l))
                  .map((l, i) => (
                    <p key={i}>{l}</p>
                  ))}
              </div>
            </li>
          ))}
        </ol>
      </Panel>
    </>
  )
}
