import { useEffect, useRef } from 'react'
import type { SimulationResult, StageName } from '../../shared/types.ts'
import { STAGE_INFO } from '../lib/stages.ts'

interface Props {
  result: SimulationResult
  cycleIndex: number
  onSelectCycle?: (i: number) => void
  dense?: boolean
}

/** Classic pipeline diagram: instructions × cycles. Click any column to inspect that cycle. */
export function TimelineMatrix({ result, cycleIndex, onSelectCycle, dense = false }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const cell = dense ? 'h-7 min-w-[34px] text-[10px]' : 'h-9 min-w-[44px] text-[11px]'

  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-col="${cycleIndex}"]`)
    if (el && scroller.current) {
      const box = scroller.current
      const left = el.offsetLeft - box.clientWidth / 2
      box.scrollTo({ left, behavior: 'smooth' })
    }
  }, [cycleIndex])

  return (
    <div ref={scroller} className="overflow-x-auto rounded-xl border border-line bg-ink-850">
      <table className="border-separate border-spacing-0 font-mono">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 bg-ink-850 px-3 py-2 text-left text-[11px] font-semibold text-dim">Instruction</th>
            {result.cycles.map((c, i) => (
              <th
                key={c.cycle}
                data-col={i}
                onClick={() => onSelectCycle?.(i)}
                className={`cursor-pointer px-0.5 py-2 text-center text-[11px] font-semibold transition ${
                  i === cycleIndex ? 'text-cyan-300' : c.stall ? 'text-rose-300' : 'text-faint hover:text-fg'
                }`}
                title={c.stall ? `Cycle ${c.cycle}: stall` : `Cycle ${c.cycle}`}
              >
                {c.cycle}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.instructions.map((ins) => (
            <tr key={ins.id}>
              <td className="sticky left-0 z-10 whitespace-nowrap border-t border-line bg-ink-850 px-3 text-xs">
                <span className="mr-2 font-bold text-fg">{ins.id}</span>
                <span className="text-dim">{ins.text}</span>
              </td>
              {ins.stageByCycle.map((s, i) => (
                <td key={i} className={`border-t border-line p-0.5 ${i === cycleIndex ? 'bg-cyan-400/10' : ''}`} onClick={() => onSelectCycle?.(i)}>
                  {s && <Cell stage={s.stage} stalled={s.stalled} className={cell} />}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td className="sticky left-0 z-10 border-t border-line bg-ink-850 px-3 text-xs text-faint">bubbles</td>
            {result.cycles.map((c, i) => {
              const where = (Object.keys(c.stages) as StageName[]).filter((s) => c.stages[s].kind === 'bubble')
              return (
                <td key={i} className={`border-t border-line p-0.5 ${i === cycleIndex ? 'bg-cyan-400/10' : ''}`} onClick={() => onSelectCycle?.(i)}>
                  {where.length > 0 && (
                    <div className={`bubble-hatch flex items-center justify-center rounded border border-dashed border-slate-500/50 text-slate-300 ${cell}`} title={`Bubble in ${where.join(', ')}`}>
                      {where.join('·')}
                    </div>
                  )}
                </td>
              )
            })}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export function Cell({ stage, stalled, className }: { stage: StageName; stalled: boolean; className: string }) {
  const info = STAGE_INFO[stage]
  if (stalled) {
    return (
      <div className={`stall-hatch flex cursor-pointer items-center justify-center rounded border border-rose-400/60 font-semibold text-rose-200 ${className}`} title={`Stalled in ${stage}`}>
        {stage}
      </div>
    )
  }
  return (
    <div
      className={`flex cursor-pointer items-center justify-center rounded border font-semibold ${className}`}
      style={{ color: info.color, background: `${info.color}1f`, borderColor: `${info.color}66` }}
    >
      {stage}
    </div>
  )
}

export function MatrixLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-dim">
      {(Object.keys(STAGE_INFO) as StageName[]).map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ background: STAGE_INFO[s].color }} />
          {s}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="stall-hatch h-3 w-5 rounded-sm border border-rose-400/60" /> stalled (held)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="bubble-hatch h-3 w-5 rounded-sm border border-dashed border-slate-500/60" /> bubble (NOP)
      </span>
    </div>
  )
}
