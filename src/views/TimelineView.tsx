import { ConfigPanel } from '../components/ConfigPanel.tsx'
import { DatapathDiagram } from '../components/DatapathDiagram.tsx'
import { PlaybackControls } from '../components/Playback.tsx'
import { StageCards } from '../components/StageCards.tsx'
import { CycleExplanation, RegisterFile } from '../components/StateViews.tsx'
import { MatrixLegend, TimelineMatrix } from '../components/TimelineMatrix.tsx'
import { useLab } from '../state/SimulationContext.tsx'
import { PageHeader, Panel, WithResult } from './common.tsx'

export function TimelineView() {
  const { cycleIndex, setCycleIndex } = useLab()
  return (
    <div className="space-y-4">
      <PageHeader index={2} title="Cycle Timeline">
        The classic pipeline diagram: one row per instruction, one column per clock cycle. Click any column to inspect the complete machine
        state in that cycle.
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
              <Panel title="Execution matrix" right={<MatrixLegend />}>
                <TimelineMatrix result={data} cycleIndex={cycleIndex} onSelectCycle={setCycleIndex} />
                <p className="mt-2 text-xs text-faint">
                  {data.metrics.totalCycles} cycles = {data.program.length} instructions + 4 fill/drain + {data.metrics.stallCycles} stall
                  {data.metrics.stallCycles === 1 ? '' : 's'}.
                </p>
              </Panel>
              <div className="grid gap-4 lg:grid-cols-5">
                <Panel title={`Cycle ${trace.cycle} inspector`} className="lg:col-span-3">
                  <CycleExplanation trace={trace} />
                  <div className="mt-4 overflow-x-auto">
                    <div className="min-w-[640px]">
                      <DatapathDiagram trace={trace} compact />
                    </div>
                  </div>
                </Panel>
                <Panel title="Registers at end of cycle" className="lg:col-span-2">
                  <RegisterFile result={data} trace={trace} />
                </Panel>
              </div>
              <StageCards trace={trace} />
            </>
          )
        }}
      </WithResult>
    </div>
  )
}
