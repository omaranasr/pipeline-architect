import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SimulationResult } from '../../shared/types.ts'
import { findWorkload } from '../../shared/workloads.ts'
import { DatapathDiagram } from '../components/DatapathDiagram.tsx'
import { ApiErrorPanel, LoadingPill, Skeleton } from '../components/StatusBanner.tsx'
import { MatrixLegend, TimelineMatrix } from '../components/TimelineMatrix.tsx'
import { fmt } from '../lib/format.ts'
import { useSimulation } from '../lib/useSimulation.ts'
import { SCENES, type Scene } from './scenes.ts'

export default function PresentationMode({ onExit }: { onExit: () => void }) {
  const [index, setIndex] = useState(0)
  const scene = SCENES[index]
  const go = useCallback((d: number) => setIndex((i) => Math.max(0, Math.min(SCENES.length - 1, i + d))), [])

  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => undefined)
    const onFs = () => {
      if (!document.fullscreenElement) onExit()
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return
      if (e.key === 'PageDown' || (e.key === 'ArrowRight' && e.shiftKey)) go(1)
      if (e.key === 'PageUp' || (e.key === 'ArrowLeft' && e.shiftKey)) go(-1)
      if (e.key === 'Escape' && !document.fullscreenElement) onExit()
    }
    document.addEventListener('fullscreenchange', onFs)
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined)
    }
  }, [go, onExit])

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-ink-950" role="dialog" aria-label="Guided presentation">
      <header className="flex items-center gap-4 border-b border-line px-6 py-3">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-cyan-300/80">Pipeline Architect · guided lab</span>
        <div className="flex flex-1 justify-center gap-1.5" role="tablist">
          {SCENES.map((s, i) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={i === index}
              onClick={() => setIndex(i)}
              className={`h-2 rounded-full transition-all ${i === index ? 'w-10 bg-cyan-400' : i < index ? 'w-4 bg-cyan-400/40' : 'w-4 bg-ink-500'}`}
              title={`${s.kicker}: ${s.title}`}
            />
          ))}
        </div>
        <button className="btn" onClick={() => go(-1)} disabled={index === 0}>
          ◀ Prev
        </button>
        <button className="btn btn-primary" onClick={() => go(1)} disabled={index === SCENES.length - 1}>
          Next ▶
        </button>
        <button className="btn btn-ghost" onClick={onExit} aria-label="Exit presentation">
          ✕ Exit
        </button>
      </header>
      <div className="flex-1 overflow-y-auto">
        <SceneView key={scene.id} scene={scene} />
      </div>
      <footer className="border-t border-line px-6 py-2 text-xs text-faint">
        PageUp/PageDown or Shift+←/→: change scene · ←/→: step cycles · Space: play/pause · Esc: exit full screen
      </footer>
    </div>
  )
}

function SceneView({ scene }: { scene: Scene }) {
  const primary = useSimulation(scene.request)
  const secondary = useSimulation(scene.compare ?? null)
  const [choice, setChoice] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(!scene.prediction)
  const ready = primary.data && (!scene.compare || secondary.data)
  const error = primary.error ?? secondary.error

  return (
    <div className="mx-auto grid max-w-[1700px] gap-8 px-6 py-8 xl:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
      <div className="fade-up">
        <p className="font-mono text-sm uppercase tracking-[0.2em] text-cyan-300">{scene.kicker}</p>
        <h2 className="mt-2 text-4xl font-bold leading-tight tracking-tight lg:text-5xl">{scene.title}</h2>
        <ul className="mt-6 space-y-3">
          {scene.points.map((p, i) => (
            <li key={i} className="flex gap-3 text-lg leading-relaxed text-fg/90 lg:text-xl">
              <span className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-cyan-400" />
              {p}
            </li>
          ))}
        </ul>

        {scene.prediction && (
          <div className="panel mt-8 p-5">
            <p className="panel-title text-amber-300">Predict before you look</p>
            <p className="mt-2 text-lg font-medium">{scene.prediction.question}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {scene.prediction.options.map((o) => {
                const correct = revealed && ready && scene.prediction!.answer(primary.data!, secondary.data) === o
                const wrong = revealed && choice === o && !correct
                return (
                  <button
                    key={o}
                    onClick={() => !revealed && setChoice(o)}
                    className={`rounded-xl border px-5 py-3 font-mono text-lg transition ${
                      correct
                        ? 'border-emerald-400 bg-emerald-400/15 text-emerald-200'
                        : wrong
                          ? 'border-rose-400 bg-rose-400/15 text-rose-200'
                          : choice === o
                            ? 'border-cyan-400 bg-cyan-400/15 text-cyan-100'
                            : 'border-line bg-ink-800 text-fg hover:border-ink-500'
                    }`}
                  >
                    {o}
                  </button>
                )
              })}
            </div>
            {!revealed ? (
              <button className="btn btn-primary mt-4 px-4 py-2" disabled={!choice || !ready} onClick={() => setRevealed(true)}>
                {ready ? 'Reveal the answer' : 'Waiting for the server…'}
              </button>
            ) : (
              ready && (
                <p className="fade-up mt-4 text-base text-dim">
                  {choice === scene.prediction.answer(primary.data!, secondary.data) ? '✓ Correct. ' : choice ? '✗ Not quite. ' : ''}
                  {scene.prediction.explain(primary.data!, secondary.data)}
                </p>
              )
            )}
            {!revealed && (
              <button className="mt-2 block text-xs text-faint underline" onClick={() => setRevealed(true)}>
                skip prediction
              </button>
            )}
          </div>
        )}
        {scene.tryThis && revealed && <p className="mt-6 rounded-lg border border-cyan-400/30 bg-cyan-400/5 p-3 text-base text-cyan-100">Try this: {scene.tryThis}</p>}
      </div>

      <div className="min-w-0">
        {error ? (
          <ApiErrorPanel error={error} onRetry={() => { primary.rerun(); secondary.rerun() }} />
        ) : !ready ? (
          <Skeleton className="h-[420px]" />
        ) : scene.kind === 'challenge' ? (
          <Challenge original={primary.data!} />
        ) : !revealed ? (
          <ProgramPreview result={primary.data!} />
        ) : scene.kind === 'compare' ? (
          <CompareScene a={primary.data!} b={secondary.data!} />
        ) : (
          <SceneSimulation result={primary.data!} intro={scene.kind === 'intro'} />
        )}
      </div>
    </div>
  )
}

function ProgramPreview({ result }: { result: SimulationResult }) {
  const w = findWorkload(result.config.workloadId)
  return (
    <div className="panel p-6">
      <p className="panel-title">The program</p>
      <ol className="mt-4 space-y-2 font-mono text-2xl">
        {result.program.map((p) => (
          <li key={p.id} className="flex gap-4">
            <span className="w-12 text-faint">{p.id}</span>
            <span>{p.text}</span>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-base text-dim">
        {w ? `${w.title} · ` : ''}forwarding {result.config.forwardingEnabled ? 'ON' : 'OFF'}. Make your prediction to start the simulation.
      </p>
    </div>
  )
}

function usePlayback(total: number) {
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(true)
  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => setI((x) => (x >= total - 1 ? (setPlaying(false), x) : x + 1)), 900)
    return () => window.clearInterval(id)
  }, [playing, total])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey || (e.target as HTMLElement).closest('input, textarea')) return
      if (e.key === 'ArrowRight') setI((x) => Math.min(total - 1, x + 1))
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
      if (e.key === ' ') {
        e.preventDefault()
        setPlaying((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [total])
  return { i, setI, playing, setPlaying }
}

function SceneSimulation({ result, intro = false }: { result: SimulationResult; intro?: boolean }) {
  const { i, setI, playing, setPlaying } = usePlayback(result.cycles.length)
  const trace = result.cycles[i]
  return (
    <div className="space-y-4">
      {intro && <SerialVsPipelined result={result} />}
      <div className="panel p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button className="btn" onClick={() => setI(Math.max(0, i - 1))}>
            ◀
          </button>
          <button
            className="btn btn-primary min-w-[90px]"
            onClick={() => {
              if (!playing && i >= result.cycles.length - 1) setI(0)
              setPlaying(!playing)
            }}
          >
            {playing ? '❚❚ Pause' : '▶ Run'}
          </button>
          <button className="btn" onClick={() => setI(Math.min(result.cycles.length - 1, i + 1))}>
            ▶
          </button>
          <span className="ml-2 font-mono text-lg">
            cycle {i + 1}
            <span className="text-faint"> / {result.cycles.length}</span>
          </span>
          <span className="ml-auto font-mono text-sm text-dim">
            CPI {fmt(result.metrics.cpi, 2)} · {result.metrics.stallCycles} stalls
          </span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            <DatapathDiagram trace={trace} compact />
          </div>
        </div>
        <p className="min-h-[3rem] px-1 text-base text-fg/90">{trace.explanation[0]}</p>
      </div>
      <div className="panel p-3">
        <div className="mb-2 flex justify-end">
          <MatrixLegend />
        </div>
        <TimelineMatrix result={result} cycleIndex={i} onSelectCycle={(x) => { setPlaying(false); setI(x) }} />
      </div>
    </div>
  )
}

function SerialVsPipelined({ result }: { result: SimulationResult }) {
  const n = result.program.length
  const serial = n * 5
  const piped = result.metrics.totalCycles
  const colors = ['#22d3ee', '#60a5fa', '#fbbf24', '#e879f9', '#34d399']
  const unit = 100 / serial
  return (
    <div className="panel p-4">
      <p className="panel-title">One instruction at a time vs. pipelined (same five stages)</p>
      {[
        ['Unpipelined', serial, (k: number) => k * 5],
        ['Pipelined', piped, (k: number) => k],
      ].map(([label, total, start]) => (
        <div key={label as string} className="mt-3">
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-dim">{label as string}</span>
            <span className="font-mono text-fg">{total as number} cycles</span>
          </div>
          <div className="relative h-[92px] rounded bg-ink-900">
            {Array.from({ length: n }, (_, k) =>
              colors.map((c, s) => (
                <div
                  key={`${k}-${s}`}
                  className="absolute h-[16px] rounded-sm"
                  style={{ left: `${((start as (k: number) => number)(k) + s) * unit}%`, width: `${unit}%`, top: k * 18 + 2, background: c, opacity: 0.85 }}
                />
              )),
            )}
          </div>
        </div>
      ))}
      <p className="mt-2 text-xs text-faint">
        Unpipelined = N × 5 (arithmetic illustration). Pipelined = {piped} cycles from the server simulation.
      </p>
    </div>
  )
}

function CompareScene({ a, b }: { a: SimulationResult; b: SimulationResult }) {
  const max = Math.max(a.metrics.executionTimeNs, b.metrics.executionTimeNs)
  const rows: [string, SimulationResult, string][] = [
    ['Forwarding ON @ 0.6 ns', a, '#f97316'],
    ['Forwarding OFF @ 0.5 ns', b, '#60a5fa'],
  ]
  return (
    <div className="space-y-4">
      <div className="panel p-5">
        <p className="panel-title">Execution time = cycles × clock period</p>
        <div className="mt-4 space-y-5">
          {rows.map(([label, r, c]) => (
            <div key={label}>
              <div className="mb-1 flex justify-between text-lg">
                <span>{label}</span>
                <span className="font-mono">
                  {r.metrics.totalCycles} × {r.metrics.clockPeriodNs} = <strong>{fmt(r.metrics.executionTimeNs, 2)} ns</strong>
                </span>
              </div>
              <div className="h-9 rounded-lg bg-ink-900">
                <div className="h-9 rounded-lg transition-all duration-700" style={{ width: `${(r.metrics.executionTimeNs / max) * 100}%`, background: c }} />
              </div>
              <div className="mt-1 font-mono text-sm text-dim">
                CPI {fmt(r.metrics.cpi, 2)} · {fmt(r.metrics.frequencyGHz, 2)} GHz · {r.metrics.stallCycles} stalls
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map(([label, r]) => (
          <div key={label} className="panel p-3">
            <p className="panel-title mb-2">{label}</p>
            <TimelineMatrix result={r} cycleIndex={-1} dense />
          </div>
        ))}
      </div>
    </div>
  )
}

function Challenge({ original }: { original: SimulationResult }) {
  const [order, setOrder] = useState(() => original.program.map((p) => p.text))
  const [submitted, setSubmitted] = useState<string[] | null>(null)
  const attempt = useSimulation(submitted ? { workloadId: 'custom', instructions: submitted, forwardingEnabled: true, clockPeriodNs: 0.5 } : null)
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[i], next[j]] = [next[j], next[i]]
    setOrder(next)
  }
  const verdict = useMemo(() => {
    const r = attempt.data
    if (!r || !submitted) return null
    const sameRegs = r.finalRegisters.every((v, i) => v === original.finalRegisters[i])
    const mem = (x: SimulationResult) => new Map(x.memory.map((m) => [m.address, m.final]))
    const mo = mem(original)
    const ma = mem(r)
    const sameMem = [...new Set([...mo.keys(), ...ma.keys()])].every((a) => (mo.get(a) ?? 1000 + a) === (ma.get(a) ?? 1000 + a))
    return { r, sameRegs, sameMem, solved: sameRegs && sameMem && r.metrics.stallCycles === 0 }
  }, [attempt.data, submitted, original])

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <p className="panel-title">Original · {original.metrics.totalCycles} cycles · {original.metrics.stallCycles} stalls</p>
          <ol className="mt-3 space-y-1 font-mono text-base text-dim">
            {original.program.map((p) => (
              <li key={p.id}>
                <span className="mr-3 text-faint">{p.id}</span>
                {p.text}
              </li>
            ))}
          </ol>
        </div>
        <div className="panel p-4">
          <p className="panel-title">Your schedule (use ↑ ↓)</p>
          <ol className="mt-3 space-y-1">
            {order.map((t, i) => (
              <li key={`${t}-${i}`} className="flex items-center gap-2 font-mono text-base">
                <span className="w-6 text-faint">{i + 1}</span>
                <span className="flex-1">{t}</span>
                <button className="btn px-2 py-0.5" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${t} up`}>
                  ↑
                </button>
                <button className="btn px-2 py-0.5" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`Move ${t} down`}>
                  ↓
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex items-center gap-2">
            <button className="btn btn-primary" onClick={() => setSubmitted([...order])}>
              Run my schedule on the server
            </button>
            <button className="btn" onClick={() => setOrder(original.program.map((p) => p.text))}>
              Reset
            </button>
            <LoadingPill show={attempt.loading} />
          </div>
        </div>
      </div>
      {attempt.error && <ApiErrorPanel error={attempt.error} />}
      {verdict && (
        <div className={`panel fade-up p-5 ${verdict.solved ? 'border-emerald-400/60' : ''}`}>
          <p className={`text-2xl font-semibold ${verdict.solved ? 'text-emerald-300' : 'text-amber-200'}`}>
            {verdict.solved
              ? `Solved: ${verdict.r.metrics.totalCycles} cycles, zero stalls, identical results.`
              : !verdict.sameRegs || !verdict.sameMem
                ? 'Your schedule changes the program’s results — a dependency was reordered.'
                : `${verdict.r.metrics.totalCycles} cycles with ${verdict.r.metrics.stallCycles} stall(s). Keep going!`}
          </p>
          <p className="mt-1 text-sm text-dim">
            Registers {verdict.sameRegs ? 'match ✓' : 'differ ✗'} · memory {verdict.sameMem ? 'matches ✓' : 'differs ✗'} · original{' '}
            {original.metrics.totalCycles} cycles → yours {verdict.r.metrics.totalCycles}
          </p>
          <div className="mt-3">
            <TimelineMatrix result={verdict.r} cycleIndex={-1} dense />
          </div>
        </div>
      )}
    </div>
  )
}
