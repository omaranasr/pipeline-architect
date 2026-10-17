# Simulation assumptions

Pipeline Architect models an **educational, deterministic, classic five-stage RISC pipeline**. It is not a
model of any particular processor, and none of its timing numbers are silicon measurements. The same text
is returned by the API in the `assumptions` field of every `/api/simulate` response.

## Machine

| Property | Value |
| --- | --- |
| Stages | IF (fetch) · ID (decode + register read) · EX (execute) · MEM (memory) · WB (write back) |
| Issue | Single issue, in order, one instruction fetched per cycle unless stalled |
| Latency | 5 cycles per instruction without stalls; N instructions take **N + 4** cycles |
| Registers | R0–R15, 32-bit two's complement; **R0 always reads 0**, writes to it are discarded |
| Register file timing | WB writes in the first half of a cycle, ID reads in the second half (same-cycle write→read) |
| Data memory | 1 KiB = 256 words, byte addressed, word (4-byte) accesses only, single-cycle |
| Initial state | `Ri = 4 × i` (R1 = 4 … R15 = 60); every memory word holds `1000 + address` |
| Not modelled | branches/prediction, exceptions, interrupts, caches, variable latency, structural hazards, speculation, superscalar/OoO |

## Instruction set

| Instruction | Semantics | Reads | Writes |
| --- | --- | --- | --- |
| `ADD rd, rs1, rs2` | rd ← (rs1 + rs2) mod 2³² | rs1, rs2 | rd |
| `SUB rd, rs1, rs2` | rd ← (rs1 − rs2) mod 2³² | rs1, rs2 | rd |
| `AND rd, rs1, rs2` | rd ← rs1 & rs2 | rs1, rs2 | rd |
| `OR  rd, rs1, rs2` | rd ← rs1 \| rs2 | rs1, rs2 | rd |
| `XOR rd, rs1, rs2` | rd ← rs1 ^ rs2 | rs1, rs2 | rd |
| `LW  rd, imm(rs1)` | rd ← MEM[rs1 + imm] | rs1 (base) | rd |
| `SW  rs2, imm(rs1)` | MEM[rs1 + imm] ← rs2 | rs1 (base), rs2 (store data) | memory |
| `NOP` | nothing | none | none |

- `imm` is a signed offset in [−2048, 2047] (decimal or `0x` hex). `LW R1, (R2)` means offset 0.
- Effective addresses must be multiples of 4 in [0, 1020]. An out-of-range or misaligned access aborts the
  simulation with HTTP 422. Addresses are never wrapped silently.
- A program has 1–32 instructions, each line at most 64 characters. Comments start with `;`, `#` or `//`.
- The parser recognises only these eight instructions. Input is parsed as text and never executed.

## Hazards

All data hazards are read-after-write (RAW): an instruction reads a register written by an earlier,
still-in-flight instruction. Sources include both ALU operands, the load/store **base** register and the
store **data** register. R0 never creates a hazard.

### Forwarding disabled

The hazard unit in ID stalls while any non-R0 source matches the destination of a register-writing
instruction in **EX or MEM**. Thanks to the same-cycle WB→ID register-file timing the consumer can proceed
when the producer reaches WB.

| Distance producer → consumer | Stall cycles |
| --- | --- |
| 1 (back to back) | 2 |
| 2 | 1 |
| ≥ 3 | 0 |

This applies equally to loads.

### Forwarding enabled

Two bypass paths feed the EX stage's operand muxes (both ALU inputs and store data):

- **EX/MEM → EX**: ALU result of the instruction one ahead.
- **MEM/WB → EX**: ALU result *or loaded data* of the instruction two ahead.

When both paths hold the same register, **EX/MEM (the younger producer) wins**. A value is never forwarded
before it exists: load data is not in EX/MEM, so a load followed immediately by a consumer of its result
causes the hazard unit to stall **one** cycle (the load-use hazard). After the bubble, the value arrives
via MEM/WB. Store data is consumed in EX, so `LW R1, …` followed by `SW R1, …` also stalls one cycle; there
is no MEM→MEM path. Distance-3 dependencies use the register file's write-then-read timing.

### Stalls and bubbles

On a stall cycle:

- the PC and the IF/ID register **hold** (the instructions in IF and ID repeat next cycle);
- a **bubble** (an all-zero control word, behaving as a NOP) is written into ID/EX;
- everything in EX, MEM and WB advances normally, so the bubble then drains through MEM and WB.

The timeline shows held instructions with red hatching and bubbles in a separate lane.

## Metrics

| Metric | Definition |
| --- | --- |
| Total cycles | Cycle in which the last instruction is in WB (cycle 1 = first fetch) |
| Retired instructions | N (explicit NOPs count as instructions; bubbles do not) |
| Stall cycles | Cycles in which the hazard unit held IF/ID. Total = N + 4 + stalls |
| CPI | total cycles / retired instructions |
| IPC | retired instructions / total cycles |
| Frequency (GHz) | 1 / clock period (ns) |
| Execution time (ns) | total cycles × clock period |
| Throughput (instr/s) | retired instructions / execution time |

The clock period (0.1–100 ns) is a **user-supplied illustrative assumption**. In the Performance Lab you can
give forwarding a longer minimum period to represent the extra mux delay on the EX path. That shows the
trade-off between fewer stalls and a slower clock; the numbers are not measurements.

The animation speed in the UI is purely visual and has nothing to do with the simulated clock.

## Verification

- `tests/simulator.test.ts` checks the required cases (5 independent → 9 cycles; dependent ALU pair → 0/2
  stalls; load-use pair → 1 stall), register-zero behaviour, producer priority, store-data forwarding,
  memory faults and stall/bubble placement.
- For every workload in both modes, the trace is checked for internal consistency: cycle-count identity,
  bubble placement after every stall, latch contents matching the next cycle's stages, per-instruction
  summaries matching the matrix, and metrics matching the trace.
- Every run is compared against a **sequential reference interpreter** (`shared/reference.ts`). The final
  registers and memory must match, and each response reports this as `architecturalCheck`.
