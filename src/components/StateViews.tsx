import type { CycleTrace, SimulationResult } from '../../shared/types.ts'

export function RegisterFile({ result, trace }: { result: SimulationResult; trace: CycleTrace }) {
  const prevRegs = trace.cycle > 1 ? result.cycles[trace.cycle - 2].registers : result.initialRegisters
  const reading = new Set<number>()
  const id = trace.stages.ID
  if (id.kind === 'instr') {
    const ins = result.program.find((p) => p.id === id.instrId)!
    if (ins.rs1 !== null) reading.add(ins.rs1)
    if (ins.rs2 !== null) reading.add(ins.rs2)
  }
  return (
    <div className="grid grid-cols-4 gap-1.5 font-mono text-xs">
      {trace.registers.map((v, r) => {
        const written = trace.regWrite && !trace.regWrite.discarded && trace.regWrite.register === r
        const changed = prevRegs[r] !== v
        return (
          <div
            key={r}
            className={`rounded-md border px-2 py-1.5 transition ${
              written ? 'border-emerald-400/70 bg-emerald-400/15' : reading.has(r) ? 'border-st-id/60 bg-st-id/10' : 'border-line bg-ink-850'
            }`}
            title={written ? `Written in WB this cycle` : reading.has(r) ? 'Read by ID this cycle' : undefined}
          >
            <div className="flex justify-between text-[10px] text-faint">
              <span>R{r}</span>
              {r === 0 && <span>≡0</span>}
              {written && <span className="text-emerald-300">WB</span>}
              {!written && reading.has(r) && <span className="text-st-id">read</span>}
            </div>
            <div className={`text-right text-sm ${changed ? 'text-emerald-200' : 'text-fg'}`}>{v}</div>
          </div>
        )
      })}
    </div>
  )
}

export function MemoryTable({ result, trace }: { result: SimulationResult; trace: CycleTrace }) {
  if (result.memory.length === 0) {
    return <p className="text-xs text-faint">This program does not access data memory. Every word initially holds 1000 + address.</p>
  }
  // value at the end of the selected cycle = initial, updated by stores up to and including this cycle
  const valueAt = (address: number, initial: number) => {
    let v = initial
    for (const c of result.cycles.slice(0, trace.cycle)) {
      if (c.memAccess?.kind === 'store' && c.memAccess.address === address) v = c.memAccess.value
    }
    return v
  }
  return (
    <table className="w-full font-mono text-xs">
      <thead>
        <tr className="text-left text-[10px] uppercase tracking-wider text-faint">
          <th className="py-1">Address</th>
          <th className="py-1 text-right">Initial</th>
          <th className="py-1 text-right">Now</th>
          <th className="py-1 text-right">Final</th>
        </tr>
      </thead>
      <tbody>
        {result.memory.map((m) => {
          const active = trace.memAccess?.address === m.address
          return (
            <tr key={m.address} className={`border-t border-line ${active ? 'bg-fuchsia-400/10' : ''}`}>
              <td className="py-1 text-dim">
                {m.address}
                {active && <span className="ml-2 text-fuchsia-300">{trace.memAccess!.kind}</span>}
              </td>
              <td className="py-1 text-right text-faint">{m.initial}</td>
              <td className="py-1 text-right text-fg">{valueAt(m.address, m.initial)}</td>
              <td className="py-1 text-right text-dim">{m.final}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function CycleExplanation({ trace }: { trace: CycleTrace }) {
  return (
    <div className="space-y-1.5" aria-live="polite">
      {trace.explanation.map((line, i) => {
        const tone = /hazard|Stall/i.test(line) ? 'border-rose-400/60' : /Forwarding/.test(line) ? 'border-orange-400/60' : /WB:|write-then-read/.test(line) ? 'border-emerald-400/60' : /MEM:/.test(line) ? 'border-fuchsia-400/60' : 'border-line'
        return (
          <p key={`${trace.cycle}-${i}`} className={`fade-up border-l-2 pl-3 text-sm leading-relaxed text-fg/90 ${tone}`} style={{ animationDelay: `${i * 40}ms` }}>
            {line}
          </p>
        )
      })}
    </div>
  )
}

/** Progress of the animation at the selected cycle (distinct from the completed-run metrics). */
export function CycleProgress({ result, cycleIndex }: { result: SimulationResult; cycleIndex: number }) {
  const upTo = result.cycles.slice(0, cycleIndex + 1)
  const retired = upTo.filter((c) => c.retired).length
  const stalls = upTo.filter((c) => c.stall).length
  const items = [
    ['Cycle', `${cycleIndex + 1} / ${result.cycles.length}`],
    ['Retired so far', `${retired} / ${result.program.length}`],
    ['Stalls so far', String(stalls)],
    ['In flight', String(Object.values(result.cycles[cycleIndex].stages).filter((s) => s.kind === 'instr').length)],
  ]
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-lg border border-line bg-ink-850 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-faint">{k}</div>
          <div className="font-mono text-base text-fg">{v}</div>
        </div>
      ))}
    </div>
  )
}
