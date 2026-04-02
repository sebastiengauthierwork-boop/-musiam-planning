/**
 * Converts decimal centièmes to "Xh MM" display format.
 * 7.80 → "7h48",  7.47 → "7h28"
 */
export function decimalToHMin(h: number): string {
  const abs = Math.abs(h)
  const hours = Math.floor(abs)
  const minutes = Math.round((abs - hours) * 60)
  const f = `${hours}h${String(minutes).padStart(2, '0')}`
  return h < 0 ? `−${f}` : f
}

/**
 * Converts "7:48", "7h48" or "7H48" to decimal centièmes.
 * 7:48 → 7.80,  7h28 → 7.467
 * Falls back to parseFloat for plain decimal strings.
 */
export function hMinToDecimal(input: string): number {
  if (!input) return 0
  const clean = input.trim().replace(/h/i, ':')
  const match = clean.match(/^(\d+):(\d{1,2})$/)
  if (match) {
    return parseInt(match[1]) + parseInt(match[2]) / 60
  }
  return parseFloat(input) || 0
}

/**
 * Format decimal centièmes with sign prefix — for écart/surplus display.
 * -0.5 → "−0h30",  1.25 → "+1h15"
 */
export function fmtEcartHMin(h: number): string {
  const abs = Math.abs(h)
  const hours = Math.floor(abs)
  const minutes = Math.round((abs - hours) * 60)
  const f = `${hours}h${String(minutes).padStart(2, '0')}`
  return (h >= 0 ? '+' : '−') + f
}
