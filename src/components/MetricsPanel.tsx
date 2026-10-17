import type { Metrics } from '../../shared/types.ts'
import { fmt, fmtRate } from '../lib/format.ts'

export function MetricsGrid({ metrics, compact = false }: { metrics: Metrics; compact?: boolean }) {
  const items: { k: string; v: string; hint: string; accent?: string }[] = [
    { k: 'Total cycles', v: String(metrics.totalCycles), hint: `ideal N+4 = ${metrics.idealCycles}`, accent: 'text-cyan-300' },
    { k: 'Retired instr.', v: String(metrics.retiredInstructions), hint: 'N (NOPs count)' },
    { k: 'Stall cycles', v: String(metrics.stallCycles), hint: 'data-hazard stalls', accent: metrics.stallCycles ? 'text-rose-300' : 'text-emerald-300' },
    { k: 'CPI', v: fmt(metrics.cpi, 3), hint: 'cycles / instr', accent: 'text-amber-300' },
    { k: 'IPC', v: fmt(metrics.ipc, 3), hint: 'instr / cycle' },
    { k: 'Clock period', v: `${fmt(metrics.clockPeriodNs, 3)} ns`, hint: 'illustrative assumption' },
    { k: 'Frequency', v: `${fmt(metrics.frequencyGHz, 3)} GHz`, hint: '1 / period' },
    { k: 'Execution time', v: `${fmt(metrics.executionTimeNs, 3)} ns`, hint: 'cycles × period', accent: 'text-fuchsia-300' },
    { k: 'Throughput', v: fmtRate(metrics.throughputIps), hint: 'instr / time', accent: 'text-emerald-300' },
  ]
  return (
    <div className={`grid gap-2 ${compact ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-9'}`}>
      {items.map((it) => (
        <div key={it.k} className="rounded-lg border border-line bg-ink-850 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-faint">{it.k}</div>
          <div className={`font-mono text-lg font-semibold ${it.accent ?? 'text-fg'}`}>{it.v}</div>
          <div className="text-[10px] text-faint">{it.hint}</div>
        </div>
      ))}
    </div>
  )
}
