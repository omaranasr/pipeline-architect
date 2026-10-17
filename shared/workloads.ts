import type { WorkloadDefinition } from './types.ts'

// Predefined workloads. Initial state: Ri = 4·i, MEM[a] = 1000 + a (see SIMULATION_ASSUMPTIONS.md).

export const WORKLOADS: readonly WorkloadDefinition[] = [
  {
    id: 'independent',
    label: 'A',
    title: 'Independent Instructions',
    summary: 'Five ALU instructions with no register dependencies.',
    lesson:
      'Ideal pipelining: one instruction completes per cycle once the pipeline is full. N instructions take N + 4 cycles because of fill and drain.',
    instructions: ['ADD R1, R2, R3', 'SUB R4, R5, R6', 'AND R7, R8, R9', 'OR R10, R11, R12', 'XOR R13, R14, R15'],
  },
  {
    id: 'dependent-alu',
    label: 'B',
    title: 'Dependent ALU Instructions',
    summary: 'A chain where every instruction consumes the previous result.',
    lesson:
      'Read-after-write hazards. Without forwarding each back-to-back dependency costs two stall cycles; EX/MEM and MEM/WB bypass paths remove them all.',
    instructions: ['ADD R1, R2, R3', 'SUB R4, R1, R5', 'AND R6, R4, R1', 'OR R7, R6, R4', 'XOR R8, R7, R6'],
  },
  {
    id: 'load-use',
    label: 'C',
    title: 'Load-Use Hazards',
    summary: 'Loads immediately followed by instructions that use the loaded value.',
    lesson:
      'A load produces its value at the end of MEM, one cycle too late for an immediately following EX. Even with forwarding, each load-use pair costs one stall.',
    instructions: ['LW R1, 0(R0)', 'ADD R2, R1, R3', 'LW R4, 4(R0)', 'SUB R5, R4, R2', 'SW R5, 8(R0)'],
  },
  {
    id: 'stress',
    label: 'D',
    title: 'Dependency Chain Stress Test',
    summary: 'Loads, stores, multiple consumers, a register written twice, and R0 corner cases.',
    lesson:
      'Producer priority (the youngest producer wins), store-data forwarding, load-use stalls, and writes to the hardwired-zero register R0.',
    instructions: [
      'LW R1, 0(R0)',
      'LW R2, 4(R0)',
      'ADD R3, R1, R2',
      'SUB R4, R3, R1',
      'SW R4, 12(R0)',
      'XOR R5, R3, R4',
      'ADD R10, R1, R2',
      'SUB R10, R10, R3',
      'AND R11, R10, R10',
      'LW R6, 12(R0)',
      'OR R7, R6, R0',
      'ADD R0, R7, R7',
      'SW R7, 16(R8)',
      'OR R9, R0, R11',
    ],
  },
]

export const WORKLOAD_IDS = WORKLOADS.map((w) => w.id)
export const CUSTOM_WORKLOAD_ID = 'custom'

export function findWorkload(id: string): WorkloadDefinition | undefined {
  return WORKLOADS.find((w) => w.id === id)
}
