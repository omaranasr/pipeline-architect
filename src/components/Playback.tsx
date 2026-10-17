import { useEffect } from 'react'
import { SPEEDS } from '../state/labConfig.ts'
import { useLab } from '../state/SimulationContext.tsx'

export function PlaybackControls({ keyboard = true }: { keyboard?: boolean }) {
  const { data, cycleIndex, setCycleIndex, step, playing, setPlaying, speed, setSpeed, reset } = useLab()
  const total = data?.cycles.length ?? 0
  const disabled = total === 0

  useEffect(() => {
    if (!keyboard) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable]')) return
      if (e.key === ' ') {
        e.preventDefault()
        setPlaying(!playing)
      } else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'Home') setCycleIndex(0)
      else if (e.key === 'End') setCycleIndex(total - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keyboard, playing, setPlaying, step, setCycleIndex, total])

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="flex items-center gap-1.5">
        <button className="btn" onClick={reset} disabled={disabled} title="Reset to cycle 1 (Home)" aria-label="Reset">
          ⏮
        </button>
        <button className="btn" onClick={() => step(-1)} disabled={disabled || cycleIndex === 0} title="Previous cycle (←)" aria-label="Previous cycle">
          ◀
        </button>
        <button
          className="btn btn-primary min-w-[88px]"
          onClick={() => setPlaying(!playing)}
          disabled={disabled}
          title="Run / pause (Space)"
          aria-label={playing ? 'Pause' : 'Run'}
        >
          {playing ? '❚❚ Pause' : '▶ Run'}
        </button>
        <button className="btn" onClick={() => step(1)} disabled={disabled || cycleIndex >= total - 1} title="Step one cycle (→)" aria-label="Step">
          Step ▶
        </button>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="shrink-0 font-mono text-sm text-dim">
          cycle <span className="text-lg font-semibold text-fg">{disabled ? '–' : cycleIndex + 1}</span>
          <span className="text-faint"> / {total || '–'}</span>
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          value={cycleIndex}
          onChange={(e) => setCycleIndex(Number(e.target.value))}
          disabled={disabled}
          className="h-2 min-w-0 flex-1 cursor-pointer accent-cyan-400"
          aria-label="Cycle navigation"
        />
      </div>

      <label className="flex shrink-0 items-center gap-2 text-xs text-dim" title="How fast the animation plays. This is NOT the simulated CPU clock frequency.">
        Animation speed
        <select className="input py-1 text-xs" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}× ({(1.1 / s).toFixed(2)} s/cycle)
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
