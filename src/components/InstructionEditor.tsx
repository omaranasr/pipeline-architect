import { useMemo, useState } from 'react'
import { MAX_INSTRUCTIONS } from '../../shared/isa.ts'
import { parseSource } from '../../shared/parser.ts'
import { WORKLOADS } from '../../shared/workloads.ts'
import { Modal } from './Modal.tsx'

const HELP = `; Supported: ADD SUB AND OR XOR  Rd, Rs1, Rs2
;            LW Rd, offset(Rbase)   SW Rs, offset(Rbase)   NOP
; R0–R15 (R0 is always 0). Initially Ri = 4·i and MEM[a] = 1000 + a.
; Comments start with ; # or //. At most ${MAX_INSTRUCTIONS} instructions.`

export function InstructionEditor({ initial, onApply, onClose }: { initial: string[]; onApply: (lines: string[]) => void; onClose: () => void }) {
  const [source, setSource] = useState(initial.join('\n'))
  const parsed = useMemo(() => parseSource(source), [source])
  const lineCount = source.split('\n').length

  return (
    <Modal title="Custom instruction sequence" onClose={onClose} wide>
      <p className="mb-3 text-sm text-dim">
        Only the eight educational instructions are recognised; the text is parsed, never executed. The server validates it again before simulating.
      </p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        <span className="self-center text-xs text-faint">Start from:</span>
        {WORKLOADS.map((w) => (
          <button key={w.id} className="btn px-2 py-1 text-xs" onClick={() => setSource(w.instructions.join('\n'))}>
            {w.label} · {w.title}
          </button>
        ))}
      </div>
      <div className="flex overflow-hidden rounded-lg border border-line bg-ink-900 focus-within:border-cyan-400/60">
        <div aria-hidden className="select-none border-r border-line bg-ink-850 px-2 py-2 text-right font-mono text-xs leading-6 text-faint">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} className={!parsed.ok && parsed.errors.some((e) => e.line === i + 1) ? 'text-rose-400' : ''}>
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          spellCheck={false}
          rows={Math.min(16, Math.max(8, lineCount))}
          className="w-full resize-y bg-transparent px-3 py-2 font-mono text-sm leading-6 text-fg outline-none"
          aria-label="Assembly program"
          maxLength={4000}
        />
      </div>
      <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-faint">{HELP}</pre>
      <div className="mt-3 min-h-[2rem] text-sm">
        {parsed.ok ? (
          <p className="text-emerald-300">✓ {parsed.instructions.length} valid instruction{parsed.instructions.length === 1 ? '' : 's'}</p>
        ) : (
          <ul className="space-y-0.5 text-rose-300">
            {parsed.errors.slice(0, 6).map((e, i) => (
              <li key={i} className="font-mono text-xs">
                {e.line > 0 ? `line ${e.line}: ` : ''}
                {e.message}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={!parsed.ok}
          onClick={() => parsed.ok && onApply(parsed.instructions.map((i) => i.text))}
        >
          Simulate this program
        </button>
      </div>
    </Modal>
  )
}
