import { IMM_MAX, IMM_MIN, isAlu, MAX_INSTRUCTIONS, MAX_LINE_LENGTH, NUM_REGISTERS } from './isa.ts'
import { OPCODES, type Instruction, type Opcode } from './types.ts'

// Parser for the educational assembly subset. It only recognises the eight supported
// instructions; nothing the user types is ever executed as code.

export interface ParseError {
  /** 1-based line number in the source text (or index + 1 for array input). */
  line: number
  message: string
}

export type ParseResult =
  | { ok: true; instructions: Instruction[] }
  | { ok: false; errors: ParseError[] }

type Decoded = Omit<Instruction, 'id' | 'index'>

const REGISTER_RE = /^R(\d{1,2})$/i
const IMM_RE = /^[+-]?(0x[0-9a-f]+|\d+)$/i
const MEM_OPERAND_RE = /^([+-]?(?:0x[0-9a-f]+|\d+))?\s*\(\s*([^)\s]+)\s*\)$/i

function parseRegister(token: string): number | string {
  const m = REGISTER_RE.exec(token.trim())
  if (!m) return `"${token.trim()}" is not a register (expected R0–R15)`
  const n = Number(m[1])
  if (n >= NUM_REGISTERS) return `register R${n} does not exist (R0–R15)`
  return n
}

function parseImmediate(token: string): number | string {
  const t = token.trim()
  if (!IMM_RE.test(t)) return `"${t}" is not a valid offset`
  const negative = t.startsWith('-')
  const body = t.replace(/^[+-]/, '')
  const magnitude = body.toLowerCase().startsWith('0x') ? parseInt(body.slice(2), 16) : parseInt(body, 10)
  const value = negative ? -magnitude : magnitude
  if (value < IMM_MIN || value > IMM_MAX) return `offset ${value} is outside [${IMM_MIN}, ${IMM_MAX}]`
  return value
}

/** Removes comments (; # //) and surrounding whitespace. */
export function stripComment(line: string): string {
  return line.replace(/(;|#|\/\/).*$/, '').trim()
}

export function formatInstruction(d: Decoded): string {
  switch (d.op) {
    case 'NOP':
      return 'NOP'
    case 'LW':
      return `LW R${d.rd}, ${d.imm}(R${d.rs1})`
    case 'SW':
      return `SW R${d.rs2}, ${d.imm}(R${d.rs1})`
    default:
      return `${d.op} R${d.rd}, R${d.rs1}, R${d.rs2}`
  }
}

/** Decodes one instruction (comments already removed). Returns an error message on failure. */
export function decodeInstruction(text: string): Decoded | string {
  const trimmed = text.trim()
  if (trimmed.length === 0) return 'empty instruction'
  const m = /^([A-Za-z]+)\s*(.*)$/.exec(trimmed)
  if (!m) return `cannot parse "${trimmed}"`
  const mnemonic = m[1].toUpperCase()
  if (!(OPCODES as readonly string[]).includes(mnemonic)) {
    return `unknown instruction "${m[1]}" (supported: ${OPCODES.join(', ')})`
  }
  const op = mnemonic as Opcode
  const rest = m[2].trim()
  const operands = rest.length === 0 ? [] : rest.split(',').map((s) => s.trim())

  if (op === 'NOP') {
    if (operands.length !== 0) return 'NOP takes no operands'
    return { op, rd: null, rs1: null, rs2: null, imm: null, text: 'NOP' }
  }

  if (isAlu(op)) {
    if (operands.length !== 3) return `${op} expects 3 registers: ${op} Rd, Rs1, Rs2`
    const regs = operands.map(parseRegister)
    const bad = regs.find((r) => typeof r === 'string')
    if (bad !== undefined) return bad as string
    const [rd, rs1, rs2] = regs as number[]
    const d: Decoded = { op, rd, rs1, rs2, imm: null, text: '' }
    return { ...d, text: formatInstruction(d) }
  }

  // LW rd, offset(base)   SW rs2, offset(base)
  if (operands.length !== 2) return `${op} expects ${op} R${op === 'LW' ? 'd' : 's'}, offset(Rbase)`
  const first = parseRegister(operands[0])
  if (typeof first === 'string') return first
  const mem = MEM_OPERAND_RE.exec(operands[1])
  if (!mem) return `"${operands[1]}" is not a memory operand (expected offset(Rbase), e.g. 8(R2))`
  const imm = mem[1] === undefined ? 0 : parseImmediate(mem[1])
  if (typeof imm === 'string') return imm
  const base = parseRegister(mem[2])
  if (typeof base === 'string') return base
  const d: Decoded =
    op === 'LW'
      ? { op, rd: first, rs1: base, rs2: null, imm, text: '' }
      : { op, rd: null, rs1: base, rs2: first, imm, text: '' }
  return { ...d, text: formatInstruction(d) }
}

function finish(decoded: Decoded[]): Instruction[] {
  return decoded.map((d, index) => ({ ...d, id: `I${index + 1}`, index }))
}

/**
 * Parses a list of instruction strings (the REST API format): one instruction per entry,
 * no blank entries.
 */
export function parseInstructionList(lines: readonly string[]): ParseResult {
  const errors: ParseError[] = []
  const decoded: Decoded[] = []
  if (lines.length === 0) return { ok: false, errors: [{ line: 0, message: 'program is empty' }] }
  if (lines.length > MAX_INSTRUCTIONS) {
    return { ok: false, errors: [{ line: 0, message: `at most ${MAX_INSTRUCTIONS} instructions are allowed` }] }
  }
  lines.forEach((raw, i) => {
    if (raw.length > MAX_LINE_LENGTH) {
      errors.push({ line: i + 1, message: `line is longer than ${MAX_LINE_LENGTH} characters` })
      return
    }
    const r = decodeInstruction(stripComment(raw))
    if (typeof r === 'string') errors.push({ line: i + 1, message: r })
    else decoded.push(r)
  })
  return errors.length > 0 ? { ok: false, errors } : { ok: true, instructions: finish(decoded) }
}

/** Parses editor source text: blank lines and comment-only lines are ignored. */
export function parseSource(source: string): ParseResult {
  const errors: ParseError[] = []
  const decoded: Decoded[] = []
  const lines = source.split(/\r?\n/)
  lines.forEach((raw, i) => {
    if (raw.length > MAX_LINE_LENGTH) {
      errors.push({ line: i + 1, message: `line is longer than ${MAX_LINE_LENGTH} characters` })
      return
    }
    const code = stripComment(raw)
    if (code.length === 0) return
    const r = decodeInstruction(code)
    if (typeof r === 'string') errors.push({ line: i + 1, message: r })
    else decoded.push(r)
  })
  if (errors.length === 0 && decoded.length === 0) errors.push({ line: 0, message: 'program is empty' })
  if (decoded.length > MAX_INSTRUCTIONS) {
    errors.push({ line: 0, message: `at most ${MAX_INSTRUCTIONS} instructions are allowed (found ${decoded.length})` })
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, instructions: finish(decoded) }
}
