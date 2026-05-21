export const SHIFT_PALETTE: { bg: string }[] = [
  { bg: '#dbeafe' },
  { bg: '#d1fae5' },
  { bg: '#fef9c3' },
  { bg: '#ffedd5' },
  { bg: '#ede9fe' },
  { bg: '#fce7f3' },
  { bg: '#ccfbf1' },
  { bg: '#d9f99d' },
  { bg: '#e0f2fe' },
  { bg: '#fef3c7' },
]

export const REPOS_COLOR  = { bg: '#000000', text: '#ffffff' }
export const ABSENCE_COLOR = { bg: '#444444', text: '#ffffff' }

/** Calcule automatiquement si le texte doit être noir ou blanc selon la luminosité du fond. */
export function autoTextColor(hexBg: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hexBg)
  if (!m) return '#000000'
  const r = parseInt(m[1], 16)
  const g = parseInt(m[2], 16)
  const b = parseInt(m[3], 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#000000' : '#ffffff'
}

/** Returns bg+text colors for any planning code. Absence codes take priority over shift codes to avoid palette bleed. */
export function getCodeColors(
  code: string,
  shiftCodes: { code: string; color?: string | null }[],
  absenceCodes: { code: string; color?: string | null }[]
): { bg: string; text: string } | null {
  if (!code) return null

  // Codes d'absence : priorité à leur couleur DB, fallback générique
  const absEntry = absenceCodes.find(c => c.code === code)
  if (absEntry) {
    if (absEntry.color) return { bg: absEntry.color, text: autoTextColor(absEntry.color) }
    if (code === 'R' || code === 'REP' || code === 'FER') return REPOS_COLOR
    return ABSENCE_COLOR
  }

  // Codes horaires : couleur DB puis palette par position
  const shiftIdx = shiftCodes.findIndex(c => c.code === code)
  if (shiftIdx !== -1) {
    const shiftColor = shiftCodes[shiftIdx].color
    if (shiftColor) return { bg: shiftColor, text: autoTextColor(shiftColor) }
    const bg = SHIFT_PALETTE[shiftIdx % SHIFT_PALETTE.length].bg
    return { bg, text: autoTextColor(bg) }
  }

  // Repos non déclaré dans absence_codes
  if (code === 'R' || code === 'REP' || code === 'FER') return REPOS_COLOR

  const fallbackBg = '#fef9c3'
  return { bg: fallbackBg, text: autoTextColor(fallbackBg) }
}
