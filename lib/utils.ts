import { SHIFT_PALETTE, REPOS_COLOR, ABSENCE_COLOR } from './codeColors'

export function isAdmin(role: string | null | undefined): boolean {
  return role === 'superadmin' || role === 'admin'
}

export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === 'superadmin'
}

function autoTextColor(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return '#000000'
  const lum = (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) / 255
  return lum > 0.5 ? '#000000' : '#ffffff'
}

export function getCodeColor(
  code: string,
  shiftCodes?: { code: string; color?: string | null }[],
  absenceCodes?: { code: string; color?: string | null }[]
): { bg: string; text: string } {
  if (!code) return { bg: '#f3f4f6', text: '#374151' }
  const c = code.trim()

  // Codes d'absence : priorité à leur couleur DB, fallback générique
  const absEntry = absenceCodes?.find(a => a.code === c)
  if (absEntry) {
    if (absEntry.color) return { bg: absEntry.color, text: autoTextColor(absEntry.color) }
    if (c === 'R' || c === 'REP' || c === 'FER') return REPOS_COLOR
    return ABSENCE_COLOR
  }

  // Codes horaires : couleur DB puis palette par position
  const shiftIdx = shiftCodes?.findIndex(s => s.code === c) ?? -1
  if (shiftIdx !== -1) {
    const shiftColor = shiftCodes![shiftIdx].color
    if (shiftColor) return { bg: shiftColor, text: autoTextColor(shiftColor) }
    const bg = SHIFT_PALETTE[shiftIdx % SHIFT_PALETTE.length].bg
    return { bg, text: autoTextColor(bg) }
  }

  // Repos non déclaré dans absence_codes
  if (c === 'R' || c === 'REP' || c === 'FER') return REPOS_COLOR

  return { bg: '#f3f4f6', text: '#374151' }
}
