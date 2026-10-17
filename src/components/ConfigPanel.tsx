import { useState } from 'react'
import { CLOCK_PERIOD_MAX_NS, CLOCK_PERIOD_MIN_NS } from '../../shared/validation.ts'
import { WORKLOADS } from '../../shared/workloads.ts'
import { useLab } from '../state/SimulationContext.tsx'
import { InstructionEditor } from './InstructionEditor.tsx'
import { SaveExperimentButton } from './SaveExperiment.tsx'
import { LoadingPill } from './StatusBanner.tsx'

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`group inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition ${
        checked ? 'border-orange-400/50 bg-orange-400/10 text-orange-200' : 'border-line bg-ink-700 text-dim'
      }`}
    >
      <span className={`relative h-4 w-7 rounded-full transition ${checked ? 'bg-orange-400' : 'bg-ink-500'}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${checked ? 'left-3.5' : 'left-0.5'}`} />
      </span>
      {label}: <strong className="font-semibold">{checked ? 'ON' : 'OFF'}</strong>
    </button>
  )
}

export function ClockInput({ value, onChange, label = 'Clock period' }: { value: number; onChange: (v: number) => void; label?: string }) {
  const [draft, setDraft] = useState(String(value))
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(String(value))
  }
  const commit = (s: string) => {
    const v = Number(s)
    if (Number.isFinite(v) && v >= CLOCK_PERIOD_MIN_NS && v <= CLOCK_PERIOD_MAX_NS) onChange(Math.round(v * 1000) / 1000)
  }
  const valid = (() => {
    const v = Number(draft)
    return Number.isFinite(v) && v >= CLOCK_PERIOD_MIN_NS && v <= CLOCK_PERIOD_MAX_NS
  })()
  return (
    <label className="inline-flex items-center gap-2 text-sm text-dim" title="Illustrative engineering assumption, not measured silicon timing">
      {label}
      <input
        type="number"
        step={0.05}
        min={CLOCK_PERIOD_MIN_NS}
        max={CLOCK_PERIOD_MAX_NS}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          commit(e.target.value)
        }}
        className={`input w-20 py-1 font-mono ${valid ? '' : 'border-rose-400/70'}`}
        aria-invalid={!valid}
      />
      <span className="font-mono text-xs">ns</span>
      <span className="font-mono text-xs text-faint">({valid ? (1 / Number(draft)).toFixed(2) : '—'} GHz)</span>
    </label>
  )
}

export function ConfigPanel() {
  const { config, setConfig, loading } = useLab()
  const [editing, setEditing] = useState(false)
  const current = WORKLOADS.find((w) => w.id === config.workloadId)

  return (
    <div className="panel p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="panel-title mr-1">Workload</span>
        {WORKLOADS.map((w) => (
          <button
            key={w.id}
            onClick={() => setConfig({ workloadId: w.id })}
            className={`rounded-lg border px-2.5 py-1.5 text-left text-sm transition ${
              config.workloadId === w.id ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-100' : 'border-line bg-ink-850 text-dim hover:text-fg'
            }`}
            title={w.summary}
          >
            <span className="mr-1.5 font-mono text-xs font-bold text-faint">{w.label}</span>
            {w.title}
          </button>
        ))}
        <button
          onClick={() => setEditing(true)}
          className={`rounded-lg border px-2.5 py-1.5 text-sm transition ${
            config.workloadId === 'custom' ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-100' : 'border-dashed border-line text-dim hover:text-fg'
          }`}
        >
          ✎ Custom{config.workloadId === 'custom' ? ` (${config.customInstructions.length})` : '…'}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <Toggle checked={config.forwardingEnabled} onChange={(v) => setConfig({ forwardingEnabled: v })} label="Forwarding" />
        <ClockInput value={config.clockPeriodNs} onChange={(v) => setConfig({ clockPeriodNs: v })} />
        <div className="ml-auto flex items-center gap-2">
          <LoadingPill show={loading} />
          <SaveExperimentButton config={config} />
        </div>
      </div>
      {current && <p className="mt-2 text-xs text-faint">{current.lesson}</p>}
      {editing && (
        <InstructionEditor
          initial={config.workloadId === 'custom' ? config.customInstructions : (current?.instructions ?? config.customInstructions)}
          onClose={() => setEditing(false)}
          onApply={(lines) => {
            setConfig({ workloadId: 'custom', customInstructions: lines })
            setEditing(false)
          }}
        />
      )}
    </div>
  )
}
