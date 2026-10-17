export function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

export function fmtFixed(n: number, digits = 2): string {
  return Number.isFinite(n) ? n.toFixed(digits) : '—'
}

/** Formats instructions/second with an SI prefix (e.g. 1.11 G instr/s). */
export function fmtRate(ips: number): string {
  const units: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'G'],
    [1e6, 'M'],
    [1e3, 'k'],
  ]
  for (const [scale, p] of units) if (ips >= scale) return `${(ips / scale).toFixed(2)} ${p}instr/s`
  return `${ips.toFixed(0)} instr/s`
}
