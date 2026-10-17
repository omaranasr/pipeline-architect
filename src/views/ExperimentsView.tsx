import { useCallback, useEffect, useState } from 'react'
import { parseSource } from '../../shared/parser.ts'
import { findWorkload } from '../../shared/workloads.ts'
import { Skeleton } from '../components/StatusBanner.tsx'
import { loadFirebase, useAuth } from '../firebase/AuthContext.tsx'
import { MAX_NAME_LENGTH, type Experiment } from '../firebase/types.ts'
import { navigate } from '../lib/router.ts'
import { useLab } from '../state/SimulationContext.tsx'
import { PageHeader } from './common.tsx'

function errorText(e: unknown): string {
  const code = (e as { code?: string }).code
  if (code === 'permission-denied') return 'Permission denied by Firestore security rules.'
  if (code === 'unavailable') return 'Firestore is unreachable. Check your connection.'
  return code ?? (e as Error).message ?? 'Unknown error'
}

export function ExperimentsView() {
  const auth = useAuth()
  return (
    <div className="space-y-4">
      <PageHeader index={5} title="My Experiments">
        Saved configurations live in Cloud Firestore under <code className="font-mono text-xs text-fg">users/{'{uid}'}/experiments</code>. Only you
        can read or change them. Reopening an experiment asks the server to simulate it again; stored metrics are never trusted.
      </PageHeader>
      {auth.status === 'disabled' ? (
        <div className="panel p-6 text-sm text-dim">
          Firebase is not configured for this deployment, so experiments cannot be saved. Set the <code className="font-mono">VITE_FIREBASE_*</code>{' '}
          variables (see <code className="font-mono">FIREBASE_SETUP.md</code>). The simulator works without an account.
        </div>
      ) : auth.status === 'loading' ? (
        <Skeleton className="h-40" />
      ) : auth.status === 'signed-out' || !auth.user ? (
        <div className="panel flex flex-col items-start gap-3 p-6">
          <p className="text-sm text-dim">Sign in with Google to save, list, rename and delete your experiments. Exploring the simulator needs no account.</p>
          {auth.error && <p className="text-sm text-rose-300">{auth.error}</p>}
          <button className="btn btn-primary" onClick={() => void auth.signIn()} aria-busy={auth.busy}>
            Sign in with Google
          </button>
        </div>
      ) : (
        <ExperimentList uid={auth.user.uid} />
      )}
    </div>
  )
}

function ExperimentList({ uid }: { uid: string }) {
  const { setConfig } = useLab()
  const [items, setItems] = useState<Experiment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const [reloadNonce, setReloadNonce] = useState(0)
  const refresh = useCallback(() => setReloadNonce((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    loadFirebase()
      .then((fb) => fb.listExperiments(uid))
      .then((xs) => {
        if (cancelled) return
        setItems(xs)
        setError(null)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(`Could not load experiments: ${errorText(e)}`)
        setItems([])
      })
    return () => {
      cancelled = true
    }
  }, [uid, reloadNonce])

  const open = (x: Experiment) => {
    if (x.workloadId === 'custom') {
      const parsed = parseSource(x.customInstructions ?? '')
      if (!parsed.ok) {
        setError(`"${x.name}" contains an invalid program and cannot be opened.`)
        return
      }
      setConfig({ workloadId: 'custom', customInstructions: parsed.instructions.map((i) => i.text), forwardingEnabled: x.forwardingEnabled, clockPeriodNs: x.clockPeriodNs })
    } else {
      setConfig({ workloadId: x.workloadId, forwardingEnabled: x.forwardingEnabled, clockPeriodNs: x.clockPeriodNs })
    }
    navigate('datapath')
  }

  const rename = async () => {
    if (!editing) return
    const name = editing.name.trim()
    if (!name || name.length > MAX_NAME_LENGTH) return
    setBusyId(editing.id)
    try {
      const fb = await loadFirebase()
      await fb.renameExperiment(uid, editing.id, name)
      setItems((xs) => xs?.map((x) => (x.id === editing.id ? { ...x, name } : x)) ?? null)
      setEditing(null)
    } catch (e) {
      setError(`Rename failed: ${errorText(e)}`)
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id: string) => {
    setBusyId(id)
    try {
      const fb = await loadFirebase()
      await fb.deleteExperiment(uid, id)
      setItems((xs) => xs?.filter((x) => x.id !== id) ?? null)
      setConfirmDelete(null)
    } catch (e) {
      setError(`Delete failed: ${errorText(e)}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-dim">{items ? `${items.length} saved experiment${items.length === 1 ? '' : 's'}` : 'Loading…'}</p>
        <button className="btn" onClick={refresh}>
          ↻ Refresh
        </button>
      </div>
      {error && (
        <div role="alert" className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      )}
      {items === null ? (
        <Skeleton className="h-40" />
      ) : items.length === 0 ? (
        <div className="panel p-6 text-sm text-dim">
          No experiments yet. Configure a run in the <a className="text-cyan-300 underline" href="#/datapath">Datapath Explorer</a> and press ☁ Save.
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((x) => (
            <li key={x.id} className="panel flex flex-col p-4">
              {editing?.id === x.id ? (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void rename()
                  }}
                >
                  <input
                    className="input flex-1"
                    value={editing.name}
                    maxLength={MAX_NAME_LENGTH}
                    autoFocus
                    onChange={(e) => setEditing({ id: x.id, name: e.target.value })}
                    aria-label="New name"
                  />
                  <button className="btn btn-primary" disabled={busyId === x.id || !editing.name.trim()}>
                    Save
                  </button>
                  <button type="button" className="btn" onClick={() => setEditing(null)}>
                    ✕
                  </button>
                </form>
              ) : (
                <h3 className="font-semibold text-fg">{x.name}</h3>
              )}
              <dl className="mt-2 space-y-0.5 text-xs text-dim">
                <div>
                  Workload: <span className="text-fg">{x.workloadId === 'custom' ? 'Custom program' : (findWorkload(x.workloadId)?.title ?? x.workloadId)}</span>
                </div>
                <div>
                  Forwarding: <span className="text-fg">{x.forwardingEnabled ? 'ON' : 'OFF'}</span> · Clock: <span className="font-mono text-fg">{x.clockPeriodNs} ns</span>
                </div>
                <div>Saved: {x.createdAt ? x.createdAt.toLocaleString() : 'pending server timestamp'}</div>
              </dl>
              {x.customInstructions && (
                <pre className="mt-2 max-h-24 overflow-auto rounded bg-ink-900 p-2 font-mono text-[11px] text-dim">{x.customInstructions}</pre>
              )}
              <div className="mt-auto flex flex-wrap gap-2 pt-3">
                <button className="btn btn-primary" onClick={() => open(x)}>
                  Open & simulate
                </button>
                <button className="btn" onClick={() => setEditing({ id: x.id, name: x.name })}>
                  Rename
                </button>
                {confirmDelete === x.id ? (
                  <>
                    <button className="btn border-rose-400/50 text-rose-200" onClick={() => void remove(x.id)} disabled={busyId === x.id}>
                      Confirm delete
                    </button>
                    <button className="btn" onClick={() => setConfirmDelete(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button className="btn" onClick={() => setConfirmDelete(x.id)}>
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
