import { ConfigPanel } from '../components/ConfigPanel.tsx'
import { DatapathDiagram } from '../components/DatapathDiagram.tsx'
import { MetricsGrid } from '../components/MetricsPanel.tsx'
import { PlaybackControls } from '../components/Playback.tsx'
import { LatchStrip, StageCards } from '../components/StageCards.tsx'
import { CycleExplanation, CycleProgress, MemoryTable, RegisterFile } from '../components/StateViews.tsx'
import { TimelineMatrix } from '../components/TimelineMatrix.tsx'
import { useLab } from '../state/SimulationContext.tsx'
import { PageHeader, Panel, WithResult } from './common.tsx'

export function DatapathView() {
  const { cycleIndex, setCycleIndex } = useLab()
  return (
    <div className="space-y-4">
      <PageHeader index={1} title="Datapath Explorer">
        Watch instructions flow through IF → ID → EX → MEM → WB. Pipeline registers, forwarding muxes and the hazard unit light up as they act.
      </PageHeader>
      <ConfigPanel />
      <WithResult>
        {(data) => {
          const trace = data.cycles[cycleIndex]
          return (
            <>
              <div className="panel p-3">
                <PlaybackControls />
              </div>
              <div className="panel overflow-x-auto p-3">
                <div className="min-w-[760px]">
                  <DatapathDiagram trace={trace} />
                </div>
              </div>
              <StageCards trace={trace} />
              <div className="grid gap-4 lg:grid-cols-5">
                <div className="space-y-4 lg:col-span-3">
                  <Panel title={`What happens in cycle ${trace.cycle}`}>
                    <CycleExplanation trace={trace} />
                  </Panel>
                  <Panel title="Pipeline registers after the clock edge">
                    <LatchStrip trace={trace} />
                  </Panel>
                </div>
                <div className="space-y-4 lg:col-span-2">
                  <Panel title="Register file (end of cycle)">
                    <RegisterFile result={data} trace={trace} />
                  </Panel>
                  <Panel title="Data memory (words touched)">
                    <MemoryTable result={data} trace={trace} />
                  </Panel>
                </div>
              </div>
              <Panel title="Animation state at the selected cycle">
                <CycleProgress result={data} cycleIndex={cycleIndex} />
              </Panel>
              <Panel
                title="Completed run · server result"
                right={
                  <span className={`chip ${data.architecturalCheck.matchesReference ? 'border-emerald-400/40 text-emerald-300' : 'border-rose-400/40 text-rose-300'}`}>
                    {data.architecturalCheck.matchesReference ? '✓ matches sequential reference' : '✗ reference mismatch'}
                  </span>
                }
              >
                <MetricsGrid metrics={data.metrics} />
              </Panel>
              <Panel title="Cycle-by-cycle execution matrix">
                <TimelineMatrix result={data} cycleIndex={cycleIndex} onSelectCycle={setCycleIndex} dense />
              </Panel>
            </>
          )
        }}
      </WithResult>
    </div>
  )
}
