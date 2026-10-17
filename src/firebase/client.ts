// Loaded with a dynamic import so the Firebase SDK does not delay the first paint of the simulator.
import { initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  GoogleAuthProvider,
  initializeAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import {
  addDoc,
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'
import { firebaseConfig, useEmulators } from './config.ts'
import type { Experiment, ExperimentInput } from './types.ts'

const app = initializeApp(firebaseConfig as Required<typeof firebaseConfig>)
// Local persistence keeps the user signed in across reloads until they sign out.
const auth = initializeAuth(app, { persistence: browserLocalPersistence, popupRedirectResolver: browserPopupRedirectResolver })
const db = getFirestore(app)

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}

export const MAX_LIST = 100

export function watchAuth(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, cb)
}

export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  await signInWithPopup(auth, provider)
}

export async function signOutUser(): Promise<void> {
  await signOut(auth)
}

const experimentsOf = (uid: string) => collection(db, 'users', uid, 'experiments')

export async function listExperiments(uid: string): Promise<Experiment[]> {
  const snap = await getDocs(query(experimentsOf(uid), orderBy('createdAt', 'desc'), limit(MAX_LIST)))
  return snap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id,
      name: String(x.name),
      workloadId: String(x.workloadId),
      customInstructions: typeof x.customInstructions === 'string' ? x.customInstructions : null,
      forwardingEnabled: Boolean(x.forwardingEnabled),
      clockPeriodNs: Number(x.clockPeriodNs),
      createdAt: x.createdAt instanceof Timestamp ? x.createdAt.toDate() : null,
    }
  })
}

export async function saveExperiment(uid: string, input: ExperimentInput): Promise<string> {
  // Only the configuration is stored. Metrics are always recomputed by /api/simulate.
  const ref = await addDoc(experimentsOf(uid), { ...input, createdAt: serverTimestamp() })
  return ref.id
}

export async function renameExperiment(uid: string, id: string, name: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid, 'experiments', id), { name })
}

export async function deleteExperiment(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'experiments', id))
}
