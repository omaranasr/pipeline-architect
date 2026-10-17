import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

// Proves user isolation and schema validation in firestore.rules against the real emulator.

let env: RulesTestEnvironment

const valid = () => ({
  name: 'Load-use, forwarding on',
  workloadId: 'load-use',
  customInstructions: null,
  forwardingEnabled: true,
  clockPeriodNs: 0.5,
  createdAt: serverTimestamp(),
})

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
  env = await initializeTestEnvironment({
    projectId: 'demo-pipeline-architect',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
  })
})

afterAll(async () => {
  await env?.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  // Seed one experiment for alice, bypassing rules.
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/alice/experiments/exp1'), { ...valid(), createdAt: Timestamp.now() })
  })
})

const alice = () => env.authenticatedContext('alice').firestore()
const bob = () => env.authenticatedContext('bob').firestore()
const anon = () => env.unauthenticatedContext().firestore()

describe('ownership', () => {
  it('owner can create, read, list, rename and delete', async () => {
    const db = alice()
    const ref = await assertSucceeds(addDoc(collection(db, 'users/alice/experiments'), valid()))
    await assertSucceeds(getDoc(ref))
    await assertSucceeds(getDocs(query(collection(db, 'users/alice/experiments'), limit(100))))
    await assertSucceeds(updateDoc(ref, { name: 'Renamed' }))
    await assertSucceeds(deleteDoc(ref))
  })

  it('unauthenticated users cannot read or write anything', async () => {
    const db = anon()
    await assertFails(getDoc(doc(db, 'users/alice/experiments/exp1')))
    await assertFails(getDocs(query(collection(db, 'users/alice/experiments'), limit(10))))
    await assertFails(addDoc(collection(db, 'users/alice/experiments'), valid()))
  })

  it("bob cannot read alice's experiments", async () => {
    const db = bob()
    await assertFails(getDoc(doc(db, 'users/alice/experiments/exp1')))
    await assertFails(getDocs(query(collection(db, 'users/alice/experiments'), limit(10))))
  })

  it("bob cannot create, modify or delete alice's experiments", async () => {
    const db = bob()
    await assertFails(addDoc(collection(db, 'users/alice/experiments'), valid()))
    await assertFails(setDoc(doc(db, 'users/alice/experiments/exp2'), valid()))
    await assertFails(updateDoc(doc(db, 'users/alice/experiments/exp1'), { name: 'pwned' }))
    await assertFails(deleteDoc(doc(db, 'users/alice/experiments/exp1')))
  })

  it('unbounded list queries are rejected', async () => {
    await assertFails(getDocs(collection(alice(), 'users/alice/experiments')))
    await assertFails(getDocs(query(collection(alice(), 'users/alice/experiments'), limit(500))))
  })

  it('everything outside users/{uid}/experiments is denied', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice'), { admin: true }))
    await assertFails(getDoc(doc(alice(), 'config/global')))
    await assertFails(setDoc(doc(alice(), 'users/alice/other/x'), { a: 1 }))
  })
})

describe('schema validation', () => {
  const create = (data: Record<string, unknown>) => addDoc(collection(alice(), 'users/alice/experiments'), data)

  it('accepts a valid custom program', async () => {
    await assertSucceeds(create({ ...valid(), workloadId: 'custom', customInstructions: 'LW R1, 0(R0)\nADD R2, R1, R1' }))
  })

  it.each([
    ['empty name', { name: '' }],
    ['overlong name', { name: 'x'.repeat(81) }],
    ['unknown workload', { workloadId: 'evil' }],
    ['custom without program', { workloadId: 'custom', customInstructions: null }],
    ['predefined with program', { customInstructions: 'NOP' }],
    ['oversized program', { workloadId: 'custom', customInstructions: 'N'.repeat(2081) }],
    ['non-boolean forwarding', { forwardingEnabled: 'yes' }],
    ['clock too small', { clockPeriodNs: 0.01 }],
    ['clock too large', { clockPeriodNs: 1000 }],
    ['clock as string', { clockPeriodNs: '0.5' }],
    ['client-supplied metrics', { cpi: 1.0 }],
    ['client-chosen timestamp', { createdAt: Timestamp.fromDate(new Date('2020-01-01')) }],
  ])('rejects %s', async (_label, patch) => {
    await assertFails(create({ ...valid(), ...patch }))
  })

  it('rejects documents missing required fields', async () => {
    const { clockPeriodNs: _omit, ...partial } = valid()
    void _omit
    await assertFails(create(partial))
  })

  it('only the name can change after creation', async () => {
    const ref = doc(alice(), 'users/alice/experiments/exp1')
    await assertSucceeds(updateDoc(ref, { name: 'Better name' }))
    await assertFails(updateDoc(ref, { name: '' }))
    await assertFails(updateDoc(ref, { clockPeriodNs: 0.2 }))
    await assertFails(updateDoc(ref, { forwardingEnabled: false }))
    await assertFails(updateDoc(ref, { cpi: 0.5 }))
  })
})
