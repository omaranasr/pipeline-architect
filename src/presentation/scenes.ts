import type { SimulationResult } from '../../shared/types.ts'
import type { SimulateRequest } from '../lib/api.ts'

export interface Prediction {
  question: string
  options: string[]
  /** Correct option derived from the actual server result(s) — never hard-coded. */
  answer: (primary: SimulationResult, secondary: SimulationResult | null) => string
  explain: (primary: SimulationResult, secondary: SimulationResult | null) => string
}

export interface Scene {
  id: number
  title: string
  kicker: string
  points: string[]
  request: SimulateRequest | null
  /** Optional second run for comparison scenes. */
  compare?: SimulateRequest
  prediction?: Prediction
  kind?: 'intro' | 'compare' | 'challenge'
  tryThis?: string
}

const DEP = ['ADD R1, R2, R3', 'SUB R4, R1, R5']

export const SCENES: Scene[] = [
  {
    id: 1,
    kicker: 'Scene 1',
    title: 'Why do CPUs use pipelines?',
    kind: 'intro',
    points: [
      'Executing an instruction takes several steps: fetch, decode, execute, access memory, write back.',
      'Without pipelining, one instruction must finish all five steps before the next starts.',
      'A pipeline overlaps the steps, like an assembly line: each stage works on a different instruction every cycle.',
      'Latency per instruction stays about the same; throughput approaches one instruction per cycle.',
    ],
    request: { workloadId: 'independent', forwardingEnabled: true, clockPeriodNs: 0.5 },
    prediction: {
      question: 'Five instructions, five stages each. If each instruction must finish before the next begins, how many cycles do they take?',
      options: ['5', '9', '10', '25'],
      answer: (r) => String(r.program.length * 5),
      explain: (r) =>
        `Unpipelined: ${r.program.length} × 5 = ${r.program.length * 5} cycles. The server’s pipelined run of the same five instructions takes ${r.metrics.totalCycles}.`,
    },
  },
  {
    id: 2,
    kicker: 'Scene 2',
    title: 'Ideal five-stage execution',
    points: [
      'Five independent instructions: no instruction needs a result from another.',
      'The first instruction needs 5 cycles to fill the pipeline; then one completes every cycle.',
      'Total cycles = N + 4. CPI approaches 1 only for long programs.',
    ],
    request: { workloadId: 'independent', forwardingEnabled: true, clockPeriodNs: 0.5 },
    prediction: {
      question: 'How many cycles does the pipeline need for these 5 independent instructions?',
      options: ['5', '9', '10', '25'],
      answer: (r) => String(r.metrics.totalCycles),
      explain: (r) => `${r.program.length} instructions + 4 fill/drain cycles = ${r.metrics.totalCycles}. CPI = ${r.metrics.cpi.toFixed(2)}.`,
    },
    tryThis: 'Step through the cycles and watch the staircase form in the matrix.',
  },
  {
    id: 3,
    kicker: 'Scene 3',
    title: 'Introduce a RAW hazard',
    points: [
      'SUB R4, R1, R5 reads R1, which ADD R1, R2, R3 has only just computed.',
      'When SUB decodes (ID), ADD is still in EX: R1 has not been written to the register file.',
      'This is a read-after-write (RAW) data hazard. With forwarding off, the hazard unit must stall.',
    ],
    request: { workloadId: 'custom', instructions: DEP, forwardingEnabled: false, clockPeriodNs: 0.5 },
    prediction: {
      question: 'With forwarding disabled, how many stall cycles does SUB suffer?',
      options: ['0', '1', '2', '3'],
      answer: (r) => String(r.metrics.stallCycles),
      explain: (r) =>
        `${r.metrics.stallCycles} stalls: SUB waits in ID until ADD reaches WB, then reads R1 in the same cycle it is written (write first half, read second half).`,
    },
    tryThis: 'Find the cycles where ID is hatched red and a bubble appears in EX.',
  },
  {
    id: 4,
    kicker: 'Scene 4',
    title: 'Observe pipeline stalls',
    points: [
      'A chain of five dependent ALU instructions, forwarding still off.',
      'Each back-to-back dependency costs two bubbles; the pipeline spends a large share of its cycles doing nothing.',
      'Look at CPI: the “one instruction per cycle” promise is gone.',
    ],
    request: { workloadId: 'dependent-alu', forwardingEnabled: false, clockPeriodNs: 0.5 },
    prediction: {
      question: 'How many cycles does the five-instruction dependency chain take without forwarding?',
      options: ['9', '13', '17', '25'],
      answer: (r) => String(r.metrics.totalCycles),
      explain: (r) => `${r.program.length} + 4 + ${r.metrics.stallCycles} stalls = ${r.metrics.totalCycles} cycles, CPI ${r.metrics.cpi.toFixed(2)}.`,
    },
  },
  {
    id: 5,
    kicker: 'Scene 5',
    title: 'Enable forwarding',
    points: [
      'The ALU result exists at the end of EX — long before WB. Why wait?',
      'Forwarding (bypass) paths feed EX/MEM and MEM/WB values straight back to the ALU inputs.',
      'The youngest producer wins when two in-flight instructions write the same register.',
    ],
    request: { workloadId: 'dependent-alu', forwardingEnabled: true, clockPeriodNs: 0.5 },
    prediction: {
      question: 'With full forwarding, how many stall cycles remain in the same chain?',
      options: ['0', '2', '4', '8'],
      answer: (r) => String(r.metrics.stallCycles),
      explain: (r) =>
        `${r.metrics.stallCycles} stalls, ${r.metrics.totalCycles} cycles. ${r.cycles.reduce((s, c) => s + c.forwards.length, 0)} operands arrived through bypass paths instead.`,
    },
    tryThis: 'Watch the orange forwarding paths light up under the datapath.',
  },
  {
    id: 6,
    kicker: 'Scene 6',
    title: 'Discover load-use hazards',
    points: [
      'A load’s data only exists at the end of MEM — one stage later than an ALU result.',
      'If the very next instruction needs it in EX, no forwarding path can deliver it in time.',
      'The hazard unit inserts exactly one bubble; then MEM/WB forwarding supplies the value.',
    ],
    request: { workloadId: 'load-use', forwardingEnabled: true, clockPeriodNs: 0.5 },
    prediction: {
      question: 'Forwarding is ON. How many stall cycles does this load-use workload need?',
      options: ['0', '1', '2', '4'],
      answer: (r) => String(r.metrics.stallCycles),
      explain: (r) => `${r.metrics.stallCycles} stalls — one per load immediately followed by a consumer. Forwarding alone cannot eliminate them.`,
    },
  },
  {
    id: 7,
    kicker: 'Scene 7',
    title: 'CPI versus clock period',
    kind: 'compare',
    points: [
      'Forwarding muxes sit on the EX critical path, so the clock may have to slow down.',
      'Illustrative assumption: forwarding ON needs 0.6 ns, forwarding OFF can run at 0.5 ns.',
      'Execution time = cycles × clock period. Lower CPI wins only if the clock penalty is small enough.',
    ],
    request: { workloadId: 'dependent-alu', forwardingEnabled: true, clockPeriodNs: 0.6 },
    compare: { workloadId: 'dependent-alu', forwardingEnabled: false, clockPeriodNs: 0.5 },
    prediction: {
      question: 'Which configuration finishes the dependency chain first?',
      options: ['Forwarding ON @ 0.6 ns', 'Forwarding OFF @ 0.5 ns', 'Exactly the same'],
      answer: (a, b) => {
        if (!b) return ''
        if (a.metrics.executionTimeNs < b.metrics.executionTimeNs) return 'Forwarding ON @ 0.6 ns'
        if (b.metrics.executionTimeNs < a.metrics.executionTimeNs) return 'Forwarding OFF @ 0.5 ns'
        return 'Exactly the same'
      },
      explain: (a, b) =>
        b
          ? `ON: ${a.metrics.totalCycles} × 0.6 = ${a.metrics.executionTimeNs.toFixed(2)} ns. OFF: ${b.metrics.totalCycles} × 0.5 = ${b.metrics.executionTimeNs.toFixed(2)} ns.`
          : '',
    },
  },
  {
    id: 8,
    kicker: 'Scene 8',
    title: 'Optimization challenge',
    kind: 'challenge',
    points: [
      'The compiler can hide load latency by scheduling independent work between a load and its use.',
      'Reorder the instructions to remove every stall, with forwarding ON.',
      'Your schedule must compute exactly the same final registers and memory as the original.',
    ],
    request: { workloadId: 'load-use', forwardingEnabled: true, clockPeriodNs: 0.5 },
  },
]
