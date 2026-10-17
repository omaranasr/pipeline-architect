import type { CycleTrace, StageName } from '../../shared/types.ts'
import { STAGE_INFO } from '../lib/stages.ts'

const STAGES: StageName[] = ['IF', 'ID', 'EX', 'MEM', 'WB']

const toneClass: Record<string, string> = {
  forwarded: 'text-orange-300',
  hazard: 'text-rose-300',
  write: 'text-emerald-300',
  memory: 'text-fuchsia-300',
  muted: 'text-faint',
}

export function StageCards({ trace }: { trace: CycleTrace }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {STAGES.map((s) => {
        const slot = trace.stages[s]
        const info = STAGE_INFO[s]
        const stalled = slot.kind === 'instr' && slot.status === 'stalled'
        return (
          <div
            key={s}
            className={`panel relative overflow-hidden p-3 ${stalled ? 'border-rose-400/60' : ''}`}
            style={{ boxShadow: `inset 0 2px 0 ${info.color}` }}
          >
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-sm font-bold" style={{ color: info.color }}>
                {s}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-faint">{info.name}</span>
            </div>
            {slot.kind === 'instr' ? (
              <>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="chip border-line bg-ink-900 font-bold text-fg">{slot.instrId}</span>
                  <span className="truncate font-mono text-xs text-fg">{slot.text}</span>
                </div>
                <div className={`mt-1.5 text-[11px] ${stalled ? 'font-semibold text-rose-300' : 'text-dim'}`}>
                  {stalled ? '● ' : ''}
                  {slot.action}
                </div>
                {slot.fields.length > 0 && (
                  <dl className="mt-2 space-y-0.5 border-t border-line pt-2 font-mono text-[11px]">
                    {slot.fields.map((f, i) => (
                      <div key={i} className="flex justify-between gap-2">
                        <dt className="truncate text-faint">{f.label}</dt>
                        <dd className={f.tone ? toneClass[f.tone] : 'text-fg'}>
                          {f.value}
                          {f.tone === 'forwarded' ? ' ⇠fwd' : ''}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </>
            ) : slot.kind === 'bubble' ? (
              <div className="bubble-hatch mt-2 rounded-md border border-dashed border-slate-500/50 p-2 text-[11px] text-slate-300">
                Bubble{slot.causedBy ? ` inserted for ${slot.causedBy}` : ''}: control signals zero, no state changes.
              </div>
            ) : (
              <div className="mt-2 text-[11px] text-faint">Empty (pipeline filling or draining)</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function LatchStrip({ trace }: { trace: CycleTrace }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {(['IF/ID', 'ID/EX', 'EX/MEM', 'MEM/WB'] as const).map((l) => {
        const s = trace.latches[l]
        return (
          <div key={l} className={`rounded-lg border p-2.5 ${s.frozen ? 'border-rose-400/50 bg-rose-500/5' : 'border-line bg-ink-850'}`}>
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold text-dim">{l}</span>
              <span className="text-[10px] text-faint">
                {s.frozen ? <span className="font-semibold text-rose-300">HOLD (stall)</span> : s.content === 'bubble' ? 'bubble' : s.content === 'empty' ? 'empty' : s.instrId}
              </span>
            </div>
            <dl className="mt-1 space-y-0.5 font-mono text-[11px]">
              {s.fields.map((f, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <dt className="truncate text-faint">{f.label}</dt>
                  <dd className={f.tone ? toneClass[f.tone] : 'text-fg'}>{f.value}</dd>
                </div>
              ))}
              {s.content === 'empty' && <div className="text-faint">—</div>}
            </dl>
          </div>
        )
      })}
    </div>
  )
}
