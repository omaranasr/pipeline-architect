import { useState } from 'react'
import { findWorkload } from '../../shared/workloads.ts'
import { loadFirebase, useAuth } from '../firebase/AuthContext.tsx'
import { MAX_NAME_LENGTH, validateExperimentInput, type ExperimentInput } from '../firebase/types.ts'
import type { LabConfig } from '../state/labConfig.ts'
import { Modal } from './Modal.tsx'

function defaultExperimentName(c: LabConfig): string {
  const w = c.workloadId === 'custom' ? 'Custom program' : (findWorkload(c.workloadId)?.title ?? c.workloadId)
  return `${w} · ${c.forwardingEnabled ? 'forwarding' : 'no forwarding'} · ${c.clockPeriodNs} ns`
}

export function SaveExperimentButton({ config }: { config: LabConfig }) {
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  if (auth.status === 'disabled') return null
  return (
    <>
      <button
        className="btn"
        onClick={() => setOpen(true)}
        title={auth.status === 'signed-in' ? 'Save this configuration to My Experiments' : 'Sign in to save experiments'}
      >
        ☁ Save
      </button>
      {open && <SaveDialog config={config} onClose={() => setOpen(false)} />}
    </>
  )
}

function SaveDialog({ config, onClose }: { config: LabConfig; onClose: () => void }) {
  const auth = useAuth()
  const [name, setName] = useState(defaultExperimentName(config))
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  if (auth.status !== 'signed-in' || !auth.user) {
    return (
      <Modal title="Sign in to save" onClose={onClose}>
        <p className="text-sm text-dim">Exploring is open to everyone. Saving experiments requires a Google account so your experiments stay private to you.</p>
        {auth.error && <p className="mt-3 text-sm text-rose-300">{auth.error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            Not now
          </button>
          <button className="btn btn-primary" onClick={() => void auth.signIn()} disabled={auth.status === 'loading'} aria-busy={auth.busy}>
            Sign in with Google
          </button>
        </div>
      </Modal>
    )
  }

  const save = async () => {
    const input: ExperimentInput = {
      name: name.trim(),
      workloadId: config.workloadId,
      customInstructions: config.workloadId === 'custom' ? config.customInstructions.join('\n') : null,
      forwardingEnabled: config.forwardingEnabled,
      clockPeriodNs: config.clockPeriodNs,
    }
    const invalid = validateExperimentInput(input)
    if (invalid) {
      setState('error')
      setMessage(invalid)
      return
    }
    setState('saving')
    try {
      const fb = await loadFirebase()
      await fb.saveExperiment(auth.user!.uid, input)
      setState('saved')
    } catch (e) {
      setState('error')
      setMessage(`Could not save: ${(e as { code?: string }).code ?? (e as Error).message}`)
    }
  }

  return (
    <Modal title="Save experiment" onClose={onClose}>
      {state === 'saved' ? (
        <>
          <p className="text-sm text-emerald-300">Saved to My Experiments.</p>
          <div className="mt-4 flex justify-end gap-2">
            <a className="btn" href="#/experiments" onClick={onClose}>
              Open My Experiments
            </a>
            <button className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <label className="block text-xs text-dim" htmlFor="exp-name">
            Name
          </label>
          <input id="exp-name" className="input mt-1 w-full" value={name} maxLength={MAX_NAME_LENGTH} onChange={(e) => setName(e.target.value)} />
          <p className="mt-3 text-xs text-faint">
            Stores the configuration only (workload, forwarding, clock period). Results are recomputed by the server whenever you reopen it.
          </p>
          {message && state === 'error' && <p className="mt-2 text-sm text-rose-300">{message}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={state === 'saving' || name.trim().length === 0}>
              {state === 'saving' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
