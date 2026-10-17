import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DEFAULT_CLOCK_PERIOD_NS } from '../../shared/validation.ts'
import { findWorkload } from '../../shared/workloads.ts'
import { useSimulation, type SimulationState } from '../lib/useSimulation.ts'
import { toRequest, type LabConfig } from './labConfig.ts'

export type { LabConfig } from './labConfig.ts'

interface LabContextValue extends SimulationState {
  config: LabConfig
  setConfig: (patch: Partial<LabConfig>) => void
  /** Index into data.cycles (0-based). */
  cycleIndex: number
  setCycleIndex: (i: number) => void
  step: (delta: number) => void
  playing: boolean
  setPlaying: (p: boolean) => void
  speed: number
  setSpeed: (s: number) => void
  reset: () => void
}

const STORAGE_KEY = 'pipeline-architect:lab-config'
const DEFAULT_CONFIG: LabConfig = {
  workloadId: 'dependent-alu',
  customInstructions: ['LW R1, 0(R0)', 'ADD R2, R1, R1', 'SW R2, 4(R0)'],
  forwardingEnabled: true,
  clockPeriodNs: DEFAULT_CLOCK_PERIOD_NS,
}

function loadConfig(): LabConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CONFIG
    const c = { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<LabConfig>) }
    if (c.workloadId !== 'custom' && !findWorkload(c.workloadId)) c.workloadId = DEFAULT_CONFIG.workloadId
    return c
  } catch {
    return DEFAULT_CONFIG
  }
}

const LabContext = createContext<LabContextValue | null>(null)

export function LabProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<LabConfig>(loadConfig)
  const request = useMemo(() => toRequest(config), [config])
  const sim = useSimulation(request, 200)
  const [cycleIndex, setCycleIndexRaw] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<number>(1)
  const total = sim.data?.cycles.length ?? 0

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    } catch {
      /* storage unavailable: ignore */
    }
  }, [config])

  // A new program or forwarding mode restarts the animation; a clock-period change keeps the cycle.
  const traceKey = sim.data ? `${sim.data.config.workloadId}|${sim.data.config.forwardingEnabled}|${sim.data.program.map((p) => p.text).join(';')}` : ''
  const lastTraceKey = useRef('')
  useEffect(() => {
    if (traceKey && traceKey !== lastTraceKey.current) {
      lastTraceKey.current = traceKey
      setCycleIndexRaw(0)
    }
  }, [traceKey])

  const setCycleIndex = useCallback(
    (i: number) => setCycleIndexRaw(Math.max(0, Math.min(i, Math.max(0, total - 1)))),
    [total],
  )
  const step = useCallback((d: number) => setCycleIndexRaw((i) => Math.max(0, Math.min(i + d, Math.max(0, total - 1)))), [total])

  // Playback: animation speed is purely visual and unrelated to the simulated clock period.
  useEffect(() => {
    if (!playing || total === 0) return
    const id = window.setInterval(() => {
      setCycleIndexRaw((i) => {
        if (i >= total - 1) {
          setPlaying(false)
          return i
        }
        return i + 1
      })
    }, 1100 / speed)
    return () => window.clearInterval(id)
  }, [playing, speed, total])

  const setConfig = useCallback((patch: Partial<LabConfig>) => setConfigState((c) => ({ ...c, ...patch })), [])
  const reset = useCallback(() => {
    setPlaying(false)
    setCycleIndexRaw(0)
  }, [])

  const value: LabContextValue = {
    ...sim,
    config,
    setConfig,
    cycleIndex: Math.min(cycleIndex, Math.max(0, total - 1)),
    setCycleIndex,
    step,
    playing,
    setPlaying: (p) => {
      if (p && cycleIndex >= total - 1) setCycleIndexRaw(0)
      setPlaying(p)
    },
    speed,
    setSpeed,
    reset,
  }
  return <LabContext.Provider value={value}>{children}</LabContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLab(): LabContextValue {
  const ctx = useContext(LabContext)
  if (!ctx) throw new Error('useLab must be used inside LabProvider')
  return ctx
}
