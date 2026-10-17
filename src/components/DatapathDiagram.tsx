import type { CycleTrace, LatchName, StageName, StageSlot } from '../../shared/types.ts'
import { FWD_COLOR, STAGE_INFO, STALL_COLOR } from '../lib/stages.ts'

// Animated five-stage datapath. Instruction tokens are keyed by instruction id and positioned
// with CSS transforms, so they glide from stage to stage when the cycle advances.

const STAGES: StageName[] = ['IF', 'ID', 'EX', 'MEM', 'WB']
const LATCHES: LatchName[] = ['IF/ID', 'ID/EX', 'EX/MEM', 'MEM/WB']
const W = 160
const PITCH = 196
const X0 = 24
const BOX_Y = 64
const BOX_H = 178
const TOKEN_Y = 168
const sx = (i: number) => X0 + i * PITCH
const lx = (i: number) => X0 + W + 12 + i * PITCH

function Hardware({ stage, x, stalled }: { stage: StageName; x: number; stalled: boolean }) {
  const c = STAGE_INFO[stage].color
  const box = (bx: number, by: number, w: number, h: number, label: string) => (
    <g>
      <rect x={bx} y={by} width={w} height={h} rx={5} fill="#0a101d" stroke={c} strokeOpacity={0.55} />
      <text x={bx + w / 2} y={by + h / 2 + 4} textAnchor="middle" fontSize={11} fill="#cbd5e1" fontFamily="JetBrains Mono">
        {label}
      </text>
    </g>
  )
  switch (stage) {
    case 'IF':
      return (
        <g>
          {box(x + 12, 84, 40, 30, 'PC')}
          {box(x + 66, 78, 82, 42, 'I-Mem')}
          <path d={`M ${x + 52} 99 H ${x + 66}`} stroke={c} strokeOpacity={0.6} />
          {stalled && (
            <text x={x + 32} y={132} textAnchor="middle" fontSize={9} fill={STALL_COLOR} fontWeight={600}>
              PCWrite=0
            </text>
          )}
        </g>
      )
    case 'ID':
      return (
        <g>
          {box(x + 12, 78, 88, 42, 'Reg File')}
          <rect x={x + 108} y={78} width={42} height={42} rx={5} fill={stalled ? '#3b0d18' : '#0a101d'} stroke={stalled ? STALL_COLOR : c} strokeOpacity={stalled ? 1 : 0.55} />
          <text x={x + 129} y={96} textAnchor="middle" fontSize={9} fill={stalled ? STALL_COLOR : '#94a3b8'} fontFamily="JetBrains Mono">
            HAZ
          </text>
          <text x={x + 129} y={110} textAnchor="middle" fontSize={9} fill={stalled ? STALL_COLOR : '#94a3b8'} fontFamily="JetBrains Mono">
            unit
          </text>
        </g>
      )
    case 'EX':
      return (
        <g>
          {/* forwarding muxes */}
          <path d={`M ${x + 14} 76 l 18 6 v 18 l -18 6 z`} fill="#0a101d" stroke={FWD_COLOR} strokeOpacity={0.7} />
          <path d={`M ${x + 14} 108 l 18 6 v 18 l -18 6 z`} fill="#0a101d" stroke={FWD_COLOR} strokeOpacity={0.7} />
          <text x={x + 23} y={94} textAnchor="middle" fontSize={8} fill="#fdba74">A</text>
          <text x={x + 23} y={126} textAnchor="middle" fontSize={8} fill="#fdba74">B</text>
          <path d={`M ${x + 32} 91 H ${x + 58} M ${x + 32} 123 H ${x + 58}`} stroke={c} strokeOpacity={0.6} />
          {/* ALU */}
          <path
            d={`M ${x + 58} 74 L ${x + 112} 92 L ${x + 112} 122 L ${x + 58} 140 L ${x + 58} 116 L ${x + 68} 107 L ${x + 58} 98 Z`}
            fill="#0a101d"
            stroke={c}
            strokeOpacity={0.8}
          />
          <text x={x + 90} y={111} textAnchor="middle" fontSize={11} fill="#fde68a" fontFamily="JetBrains Mono">
            ALU
          </text>
          <path d={`M ${x + 112} 107 H ${x + 150}`} stroke={c} strokeOpacity={0.6} />
        </g>
      )
    case 'MEM':
      return box(x + 30, 78, 100, 42, 'D-Mem')
    case 'WB':
      return (
        <g>
          <path d={`M ${x + 56} 76 l 22 8 v 30 l -22 8 z`} fill="#0a101d" stroke={c} strokeOpacity={0.7} />
          <text x={x + 67} y={102} textAnchor="middle" fontSize={8} fill="#a7f3d0">MUX</text>
          <path d={`M ${x + 78} 99 H ${x + 100} V 58`} stroke={c} strokeOpacity={0.6} fill="none" />
        </g>
      )
  }
}

function Token({ slot, x }: { slot: Extract<StageSlot, { kind: 'instr' }>; x: number }) {
  const stalled = slot.status === 'stalled'
  return (
    <g style={{ transform: `translate(${x + 10}px, ${TOKEN_Y}px)`, transition: 'transform 520ms cubic-bezier(.4,.1,.2,1)' }}>
      <rect width={W - 20} height={56} rx={8} fill={stalled ? '#2a0c16' : '#0f1830'} stroke={stalled ? STALL_COLOR : '#e2e8f0'} strokeOpacity={stalled ? 0.95 : 0.25} strokeWidth={stalled ? 1.5 : 1} />
      <rect x={8} y={8} width={30} height={17} rx={4} fill={stalled ? STALL_COLOR : '#e2e8f0'} fillOpacity={stalled ? 0.25 : 0.12} />
      <text x={23} y={20.5} textAnchor="middle" fontSize={11} fontWeight={700} fill={stalled ? '#fecdd3' : '#f8fafc'} fontFamily="JetBrains Mono">
        {slot.instrId}
      </text>
      <text x={44} y={20.5} fontSize={10} fill={stalled ? '#fda4af' : '#94a3b8'} fontWeight={600}>
        {stalled ? 'STALLED' : slot.op}
      </text>
      <text x={8} y={43} fontSize={11.5} fill="#e2e8f0" fontFamily="JetBrains Mono">
        {slot.text.length > 19 ? slot.text.slice(0, 18) + '…' : slot.text}
      </text>
    </g>
  )
}

export function DatapathDiagram({ trace, compact = false }: { trace: CycleTrace; compact?: boolean }) {
  const fwdExMem = trace.forwards.filter((f) => f.path === 'EX/MEM→EX')
  const fwdMemWb = trace.forwards.filter((f) => f.path === 'MEM/WB→EX')
  const wbActive = trace.regWrite && !trace.regWrite.discarded
  const bypass = trace.registerFileBypasses.length > 0
  const tokens = STAGES.flatMap((s, i) => {
    const slot = trace.stages[s]
    return slot.kind === 'instr' ? [{ slot, x: sx(i) }] : []
  }).sort((a, b) => a.slot.instrId.localeCompare(b.slot.instrId))

  return (
    <svg viewBox={`0 0 1000 ${compact ? 330 : 350}`} className="w-full" role="img" aria-label={`Five-stage datapath at cycle ${trace.cycle}`}>
      <defs>
        <marker id="arrow-fwd" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={FWD_COLOR} />
        </marker>
        <marker id="arrow-wb" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#34d399" />
        </marker>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* write-back path to the register file */}
      <path
        d={`M ${sx(4) + 100} 64 V 24 H ${sx(1) + 56} V 76`}
        fill="none"
        stroke="#34d399"
        strokeWidth={wbActive ? 2.5 : 1}
        strokeOpacity={wbActive ? 1 : 0.18}
        className={wbActive ? 'flow' : undefined}
        markerEnd={wbActive ? 'url(#arrow-wb)' : undefined}
        filter={wbActive ? 'url(#glow)' : undefined}
      />
      <text x={sx(2) + 80} y={18} textAnchor="middle" fontSize={10.5} fill={wbActive ? '#6ee7b7' : '#475569'} fontFamily="JetBrains Mono">
        {wbActive
          ? `WB → register file: R${trace.regWrite!.register} ← ${trace.regWrite!.value}${bypass ? '  (read by ID this cycle)' : ''}`
          : 'write-back path → register file'}
      </text>

      {STAGES.map((s, i) => {
        const slot = trace.stages[s]
        const info = STAGE_INFO[s]
        const stalled = slot.kind === 'instr' && slot.status === 'stalled'
        return (
          <g key={s}>
            <text x={sx(i)} y={52} fontSize={15} fontWeight={700} fill={info.color}>
              {s}
            </text>
            <text x={sx(i) + (s.length > 2 ? 40 : 28)} y={52} fontSize={10} fill="#64748b">
              {info.name}
            </text>
            <rect
              x={sx(i)}
              y={BOX_Y}
              width={W}
              height={BOX_H}
              rx={12}
              fill={stalled ? 'rgba(251,113,133,0.06)' : 'rgba(13,20,36,0.85)'}
              stroke={stalled ? STALL_COLOR : info.color}
              strokeOpacity={stalled ? 0.9 : 0.35}
              strokeWidth={stalled ? 1.6 : 1}
              className={stalled ? 'pulse-soft' : undefined}
            />
            <rect x={sx(i)} y={BOX_Y} width={W} height={4} rx={2} fill={info.color} fillOpacity={0.7} />
            <Hardware stage={s} x={sx(i)} stalled={stalled} />
            {slot.kind === 'bubble' && (
              <g className="fade-up">
                <rect x={sx(i) + 10} y={TOKEN_Y} width={W - 20} height={56} rx={8} fill="rgba(148,163,184,0.06)" stroke="#94a3b8" strokeDasharray="5 4" strokeOpacity={0.6} />
                <text x={sx(i) + W / 2} y={TOKEN_Y + 25} textAnchor="middle" fontSize={12} fontWeight={600} fill="#cbd5e1">
                  bubble
                </text>
                <text x={sx(i) + W / 2} y={TOKEN_Y + 42} textAnchor="middle" fontSize={9.5} fill="#94a3b8">
                  {slot.causedBy ? `inserted for ${slot.causedBy}` : 'no operation'}
                </text>
              </g>
            )}
            {slot.kind === 'empty' && (
              <text x={sx(i) + W / 2} y={TOKEN_Y + 32} textAnchor="middle" fontSize={11} fill="#334155">
                — empty —
              </text>
            )}
          </g>
        )
      })}

      {tokens.map(({ slot, x }) => (
        <Token key={slot.instrId} slot={slot} x={x} />
      ))}

      {/* pipeline registers */}
      {LATCHES.map((l, i) => {
        const snap = trace.latches[l]
        const frozen = snap.frozen
        const bubble = snap.content === 'bubble'
        return (
          <g key={l}>
            <rect
              x={lx(i)}
              y={BOX_Y - 6}
              width={12}
              height={BOX_H + 12}
              rx={3}
              fill={frozen ? '#3b0d18' : bubble ? '#1e293b' : '#111a2e'}
              stroke={frozen ? STALL_COLOR : '#475569'}
              strokeWidth={frozen ? 1.6 : 1}
            />
            <text
              transform={`translate(${lx(i) + 9}, ${BOX_Y + BOX_H / 2}) rotate(-90)`}
              textAnchor="middle"
              fontSize={9}
              fill={frozen ? '#fecdd3' : '#94a3b8'}
              fontFamily="JetBrains Mono"
              fontWeight={600}
            >
              {l}
              {frozen ? ' · HOLD' : bubble ? ' · NOP' : ''}
            </text>
          </g>
        )
      })}

      {/* forwarding paths */}
      <g>
        <path
          d={`M ${lx(2) + 6} ${BOX_Y + BOX_H + 6} V 282 H ${sx(2) + 8} V 126 H ${sx(2) + 14}`}
          fill="none"
          stroke={FWD_COLOR}
          strokeWidth={fwdExMem.length ? 2.6 : 1}
          strokeOpacity={fwdExMem.length ? 1 : 0.16}
          className={fwdExMem.length ? 'flow' : undefined}
          markerEnd={fwdExMem.length ? 'url(#arrow-fwd)' : undefined}
          filter={fwdExMem.length ? 'url(#glow)' : undefined}
        />
        <path
          d={`M ${lx(3) + 6} ${BOX_Y + BOX_H + 6} V 310 H ${sx(2) + 2} V 92 H ${sx(2) + 14}`}
          fill="none"
          stroke={FWD_COLOR}
          strokeWidth={fwdMemWb.length ? 2.6 : 1}
          strokeOpacity={fwdMemWb.length ? 1 : 0.16}
          className={fwdMemWb.length ? 'flow' : undefined}
          markerEnd={fwdMemWb.length ? 'url(#arrow-fwd)' : undefined}
          filter={fwdMemWb.length ? 'url(#glow)' : undefined}
        />
        <text x={sx(3) - 6} y={276} fontSize={10.5} fill={fwdExMem.length ? '#fdba74' : '#475569'} fontFamily="JetBrains Mono">
          EX/MEM → EX{fwdExMem.length ? ':  ' + fwdExMem.map((f) => `R${f.register}=${f.value} → ${f.consumerId} ${short(f.operand)}`).join(', ') : ''}
        </text>
        <text x={sx(3) - 6} y={304} fontSize={10.5} fill={fwdMemWb.length ? '#fdba74' : '#475569'} fontFamily="JetBrains Mono">
          MEM/WB → EX{fwdMemWb.length ? ':  ' + fwdMemWb.map((f) => `R${f.register}=${f.value} → ${f.consumerId} ${short(f.operand)}`).join(', ') : ''}
        </text>
      </g>

      {trace.stall && (
        <g className="fade-up">
          <rect x={sx(0)} y={BOX_Y + BOX_H + 20} width={W * 2 + 36} height={30} rx={8} fill="rgba(251,113,133,0.12)" stroke={STALL_COLOR} strokeOpacity={0.7} />
          <text x={sx(0) + 12} y={BOX_Y + BOX_H + 40} fontSize={11.5} fill="#fecdd3" fontWeight={600}>
            STALL · {trace.hazards[0].kind === 'load-use' ? 'load-use' : 'RAW'} on R{trace.hazards[0].register} ({trace.hazards[0].consumerId} ← {trace.hazards[0].producerId})
          </text>
        </g>
      )}
      {!compact && (
        <text x={1000 - 24} y={344} textAnchor="end" fontSize={10} fill="#475569">
          Cycle {trace.cycle} · pipeline registers update at the clock edge ending this cycle
        </text>
      )}
    </svg>
  )
}

function short(role: string): string {
  return role === 'operand A' ? '(A)' : role === 'operand B' ? '(B)' : role === 'store data' ? '(data)' : '(base)'
}
