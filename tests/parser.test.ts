import { describe, expect, it } from 'vitest'
import { parseInstructionList, parseSource } from '../shared/parser.ts'
import { WORKLOADS } from '../shared/workloads.ts'

describe('assembly parser', () => {
  it('decodes every supported instruction format', () => {
    const r = parseSource(`
      add r1, r2, r3   ; comment
      SUB R4,R5,R6
      and R7, R8, R9 # another
      OR R10, R11, R12 // and another
      XOR R13, R14, R15
      LW R1, 8(R2)
      SW R3, -4(R4)
      LW R5, (R6)
      LW R7, 0x10(R0)
      NOP
    `)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instructions.map((i) => i.text)).toEqual([
      'ADD R1, R2, R3',
      'SUB R4, R5, R6',
      'AND R7, R8, R9',
      'OR R10, R11, R12',
      'XOR R13, R14, R15',
      'LW R1, 8(R2)',
      'SW R3, -4(R4)',
      'LW R5, 0(R6)',
      'LW R7, 16(R0)',
      'NOP',
    ])
    expect(r.instructions[6]).toMatchObject({ op: 'SW', rd: null, rs1: 4, rs2: 3, imm: -4 })
    expect(r.instructions.map((i) => i.id).at(-1)).toBe('I10')
  })

  it.each([
    ['MUL R1, R2, R3', /unknown instruction/],
    ['ADD R1, R2', /expects 3 registers/],
    ['ADD R16, R1, R2', /does not exist/],
    ['ADD R1, R2, 5', /not a register/],
    ['LW R1, R2', /memory operand/],
    ['LW R1, 4096(R0)', /outside/],
    ['NOP R1', /no operands/],
    ['SW R1, 4(R2', /memory operand/],
  ])('rejects %s', (line, msg) => {
    const r = parseSource(line)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0].message).toMatch(msg)
  })

  it('reports line numbers and limits', () => {
    const r = parseSource('ADD R1, R2, R3\n\nFOO\n')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0].line).toBe(3)
    expect(parseSource('').ok).toBe(false)
    expect(parseSource('; only a comment').ok).toBe(false)
    expect(parseSource(Array(33).fill('NOP').join('\n')).ok).toBe(false)
    expect(parseSource('NOP ' + ' '.repeat(80)).ok).toBe(false)
    expect(parseInstructionList(['NOP', '']).ok).toBe(false)
  })

  it('treats script-like input as invalid text, never code', () => {
    const r = parseSource('<script>alert(1)</script>\nconsole.log(1)')
    expect(r.ok).toBe(false)
  })

  it('all predefined workloads parse', () => {
    for (const w of WORKLOADS) expect(parseInstructionList(w.instructions).ok).toBe(true)
  })
})
