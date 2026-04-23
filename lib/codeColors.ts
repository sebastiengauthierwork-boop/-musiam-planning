export const SHIFT_PALETTE: { bg: string; text: string }[] = [
  { bg: '#dbeafe', text: '#1e3a5f' },
  { bg: '#d1fae5', text: '#14532d' },
  { bg: '#fef9c3', text: '#713f12' },
  { bg: '#ffedd5', text: '#7c2d12' },
  { bg: '#ede9fe', text: '#4c1d95' },
  { bg: '#fce7f3', text: '#831843' },
  { bg: '#ccfbf1', text: '#134e4a' },
  { bg: '#d9f99d', text: '#365314' },
  { bg: '#e0f2fe', text: '#0c4a6e' },
  { bg: '#fef3c7', text: '#78350f' },
]

export const REPOS_COLOR  = { bg: '#000000', text: '#ffffff' }
export const ABSENCE_COLOR = { bg: '#444444', text: '#ffffff' }

/** Returns bg+text colors for any planning code. */
export function getCodeColors(
  code: string,
  shiftCodes: { code: string }[],
  absenceCodes: { code: string }[]
): { bg: string; text: string } | null {
  if (!code) return null
  const shiftIdx = shiftCodes.findIndex(c => c.code === code)
  if (shiftIdx !== -1) return SHIFT_PALETTE[shiftIdx % SHIFT_PALETTE.length]
  if (code === 'R' || code === 'REP' || code === 'FER') return REPOS_COLOR
  if (absenceCodes.some(c => c.code === code)) return ABSENCE_COLOR
  return { bg: '#fef9c3', text: '#713f12' }
}
