import { useState } from 'react'
import type { Metrics } from '../../shared/types.ts'
import { WORKLOADS } from '../../shared/workloads.ts'
import { ClockInput } from '../components/ConfigPanel.tsx'
import { MetricsGrid } from '../components/MetricsPanel.tsx'
import { ApiErrorPanel, LoadingPill, Skeleton } from '../components/StatusBanner.tsx'
import { fmt, fmtRate } from '../lib/format.ts'
import { useSimulation } from '../lib/useSimulation.ts'
import { toRequest, type LabConfig } from '../state/labConfig.ts'
import { useLab } from '../state/SimulationContext.tsx'
import { PageHeader, Panel } from './common.tsx'

const ON_COLOR = '#f97316'
const OFF_COLOR = '#60a5fa'

function Bars({ label, a, b, format, lowerIsBetter }: { label: string; a: number; b: number; format: (n: number) => string; lowerIsBetter: boolean }) {
  const max = Math.max(a, b) || 1
  const winA = lowerIsBetter ? a < b : a > b
  const winB = lowerIsBetter ? b < a : b > a
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-dim">{label}</span>
        <span className="text-faint">{lowerIsBetter ? 'lower is better' : 'higher is better'}</span>
      </div>
      {[
        ['ON', a, ON_COLOR, winA],
        ['OFF', b, OFF_COLOR, winB],
      ].map(([k, v, c, win]) => (
        <div key={k as string} className="mb-1 flex items-center gap-2">
          <span className="w-8 font-mono text-[10px] text-faint">{k as string}</span>
          <div className="h-5 flex-1 rounded bg-ink-900">
            <div
              className="flex h-5 items-center justify-end rounded px-2 font-mono text-[11px] font-semibold text-ink-950 transition-all duration-500"
              style={{ width: `${Math.max(4, ((v as number) / max) * 100)}%`, background: c as string }}
            >
              {format(v as number)}
            </div>
          </div>
          <span className="w-4 text-xs text-emerald-300">{win ? '★' : ''}</span>
        </div>
      ))}
    </div>
  )
}

export function PerformanceView() {
  const { config, setConfig } = useLab()
  const [periodOn, setPeriodOn] = useState(0.6)
  const [periodOff, setPeriodOff] = useState(0.5)
  const onCfg: LabConfig = { ...config, forwardingEnabled: true, clockPeriodNs: periodOn }
  const offCfg: LabConfig = { ...config, forwardingEnabled: false, clockPeriodNs: periodOff }
  const on = useSimulation(toRequest(onCfg), 250)
  const off = useSimulation(toRequest(offCfg), 250)
  const err = on.error ?? off.error

  return (
    <div className="space-y-4">
      <PageHeader index={4} title="Performance Lab">
        Fewer stalls are not the whole story. Forwarding muxes add delay to the EX stage, which may force a longer clock period. Compare
        execution time and throughput, not just CPI.
      </PageHeader>

      <div className="panel flex flex-wrap items-center gap-2 p-3">
        <span className="panel-title mr-1">Workload</span>
        {WORKLOADS.map((w) => (
          <button
            key={w.id}
            onClick={() => setConfig({ workloadId: w.id })}
            className={`rounded-lg border px-2.5 py-1.5 text-sm ${config.workloadId === w.id ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-100' : 'border-line bg-ink-850 text-dim hover:text-fg'}`}
          >
            <span className="mr-1.5 font-mono text-xs text-faint">{w.label}</span>
            {w.title}
          </button>
        ))}
        {config.workloadId === 'custom' && <span className="chip border-cyan-400/50 text-cyan-200">custom program ({config.customInstructions.length})</span>}
        <LoadingPill show={on.loading || off.loading} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-4" style={{ boxShadow: `inset 0 3px 0 ${ON_COLOR}` }}>
          <h2 className="text-sm font-semibold" style={{ color: ON_COLOR }}>
            Configuration A · forwarding ON
          </h2>
          <div className="mt-2">
            <ClockInput value={periodOn} onChange={setPeriodOn} label="Min. clock period" />
          </div>
          <p className="mt-1 text-xs text-faint">Illustrative: bypass muxes lengthen the EX critical path.</p>
        </section>
        <section className="panel p-4" style={{ boxShadow: `inset 0 3px 0 ${OFF_COLOR}` }}>
          <h2 className="text-sm font-semibold" style={{ color: OFF_COLOR }}>
            Configuration B · forwarding OFF
          </h2>
          <div className="mt-2">
            <ClockInput value={periodOff} onChange={setPeriodOff} label="Min. clock period" />
          </div>
          <p className="mt-1 text-xs text-faint">Illustrative: simpler EX stage, but every RAW dependency waits for WB.</p>
        </section>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="self-center text-faint">Presets:</span>
        <button className="btn px-2 py-1 text-xs" onClick={() => { setPeriodOn(0.5); setPeriodOff(0.5) }}>
          Equal clocks (0.5 / 0.5 ns)
        </button>
        <button className="btn px-2 py-1 text-xs" onClick={() => { setPeriodOn(0.6); setPeriodOff(0.5) }}>
          Forwarding +20% delay (0.6 / 0.5 ns)
        </button>
        <button className="btn px-2 py-1 text-xs" onClick={() => { setPeriodOn(1.0); setPeriodOff(0.5) }}>
          Forwarding very costly (1.0 / 0.5 ns)
        </button>
      </div>

      {err ? (
        <ApiErrorPanel error={err} onRetry={() => { on.rerun(); off.rerun() }} />
      ) : !on.data || !off.data ? (
        <Skeleton className="h-64" />
      ) : (
        <Comparison a={on.data.metrics} b={off.data.metrics} />
      )}

      <WorkloadSweep periodOn={periodOn} periodOff={periodOff} />
    </div>
  )
}

function Comparison({ a, b }: { a: Metrics; b: Metrics }) {
  const faster = a.executionTimeNs < b.executionTimeNs ? 'A' : b.executionTimeNs < a.executionTimeNs ? 'B' : null
  const speedup = faster === 'A' ? b.executionTimeNs / a.executionTimeNs : faster === 'B' ? a.executionTimeNs / b.executionTimeNs : 1
  const breakEven = (b.totalCycles * b.clockPeriodNs) / a.totalCycles
  return (
    <>
      <div className={`panel p-4 ${faster ? 'border-emerald-400/40' : ''}`}>
        <p className="text-lg font-semibold">
          {faster === null
            ? 'Both configurations take exactly the same time.'
            : `${faster === 'A' ? 'Forwarding ON' : 'Forwarding OFF'} finishes first — ${fmt(speedup, 3)}× faster.`}
        </p>
        <p className="mt-1 text-sm text-dim">
          A: {a.totalCycles} cycles × {a.clockPeriodNs} ns = {fmt(a.executionTimeNs, 3)} ns · B: {b.totalCycles} cycles × {b.clockPeriodNs} ns ={' '}
          {fmt(b.executionTimeNs, 3)} ns. For this workload, forwarding stays ahead while its clock period is below{' '}
          <span className="font-mono text-fg">{fmt(breakEven, 3)} ns</span> (break-even = cycles<sub>B</sub> × period<sub>B</sub> / cycles<sub>A</sub>, from the
          server-reported cycle counts).
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Head to head">
          <div className="space-y-4">
            <Bars label="Total cycles" a={a.totalCycles} b={b.totalCycles} format={(n) => String(n)} lowerIsBetter />
            <Bars label="CPI" a={a.cpi} b={b.cpi} format={(n) => fmt(n, 3)} lowerIsBetter />
            <Bars label="Execution time (ns)" a={a.executionTimeNs} b={b.executionTimeNs} format={(n) => fmt(n, 2)} lowerIsBetter />
            <Bars label="Throughput" a={a.throughputIps} b={b.throughputIps} format={fmtRate} lowerIsBetter={false} />
          </div>
        </Panel>
        <div className="space-y-4">
          <Panel title="A · forwarding ON · completed run">
            <MetricsGrid metrics={a} compact />
          </Panel>
          <Panel title="B · forwarding OFF · completed run">
            <MetricsGrid metrics={b} compact />
          </Panel>
        </div>
      </div>
    </>
  )
}

function SweepRow({ workloadId, periodOn, periodOff }: { workloadId: string; periodOn: number; periodOff: number }) {
  const w = WORKLOADS.find((x) => x.id === workloadId)!
  const on = useSimulation({ workloadId, forwardingEnabled: true, clockPeriodNs: periodOn }, 400)
  const off = useSimulation({ workloadId, forwardingEnabled: false, clockPeriodNs: periodOff }, 400)
  const a = on.data?.metrics
  const b = off.data?.metrics
  const cell = 'py-2 pr-3 text-right font-mono text-xs'
  return (
    <tr className="border-t border-line">
      <td className="py-2 pr-3 text-sm">
        <span className="mr-1.5 font-mono text-xs text-faint">{w.label}</span>
        {w.title}
      </td>
      {on.error || off.error ? (
        <td colSpan={7} className="py-2 text-xs text-rose-300">
          {(on.error ?? off.error)!.message}
        </td>
      ) : (
        <>
          <td className={cell}>{a?.totalCycles ?? '…'}</td>
          <td className={cell}>{b?.totalCycles ?? '…'}</td>
          <td className={cell}>{a ? fmt(a.cpi, 2) : '…'}</td>
          <td className={cell}>{b ? fmt(b.cpi, 2) : '…'}</td>
          <td className={cell}>{a ? fmt(a.executionTimeNs, 2) : '…'}</td>
          <td className={cell}>{b ? fmt(b.executionTimeNs, 2) : '…'}</td>
          <td className={`${cell} font-semibold`} style={{ color: a && b ? (a.executionTimeNs < b.executionTimeNs ? ON_COLOR : b.executionTimeNs < a.executionTimeNs ? OFF_COLOR : undefined) : undefined }}>
            {a && b ? (a.executionTimeNs < b.executionTimeNs ? 'ON' : b.executionTimeNs < a.executionTimeNs ? 'OFF' : 'tie') : '…'}
          </td>
        </>
      )}
    </tr>
  )
}

function WorkloadSweep({ periodOn, periodOff }: { periodOn: number; periodOff: number }) {
  return (
    <Panel title="All predefined workloads with these clock periods">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px]">
          <thead>
            <tr className="text-right text-[10px] uppercase tracking-wider text-faint">
              <th className="py-2 pr-3 text-left">Workload</th>
              <th className="py-2 pr-3">Cycles ON</th>
              <th className="py-2 pr-3">Cycles OFF</th>
              <th className="py-2 pr-3">CPI ON</th>
              <th className="py-2 pr-3">CPI OFF</th>
              <th className="py-2 pr-3">Time ON (ns)</th>
              <th className="py-2 pr-3">Time OFF (ns)</th>
              <th className="py-2 pr-3">Faster</th>
            </tr>
          </thead>
          <tbody>
            {WORKLOADS.map((w) => (
              <SweepRow key={w.id} workloadId={w.id} periodOn={periodOn} periodOff={periodOff} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-faint">Each cell comes from its own /api/simulate call. Independent code gains nothing from forwarding, so a slower clock makes it strictly worse.</p>
    </Panel>
  )
}
