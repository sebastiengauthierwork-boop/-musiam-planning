export function isAdmin(role: string | null | undefined): boolean {
  return role === 'superadmin' || role === 'admin'
}

export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === 'superadmin'
}

export function getCodeColor(code: string): { bg: string; text: string } {
  if (!code) return { bg: '#f3f4f6', text: '#374151' }
  const c = code.trim()
  const first = c[0]?.toUpperCase() ?? ''
  const last  = c[c.length - 1]?.toUpperCase() ?? ''

  // Repos
  if (c === 'R') return { bg: '#000000', text: '#ffffff' }

  // Congés / absences standards
  if (['CP', 'JF', 'RTT', 'RSD'].includes(c)) return { bg: '#888888', text: '#ffffff' }

  // Maladie et absences (M seul comme code absence, AT, CSS, etc.)
  // Note: M* comme code horaire manager est traité après
  if (c === 'M' || c === 'AT' || c === 'CSS') return { bg: '#A83232', text: '#ffffff' }
  // Autres codes absence qui ne commencent pas par M/E/C
  if (!['M', 'E', 'C'].includes(first) && !['P', 'P/O', 'P/F'].includes(c)) {
    return { bg: '#A83232', text: '#ffffff' }
  }

  // Cadres / codes P
  if (c === 'P')   return { bg: '#8899AA', text: '#ffffff' }
  if (c === 'P/O') return { bg: '#A0B0C0', text: '#1e293b' }
  if (c === 'P/F') return { bg: '#667788', text: '#ffffff' }
  if (first === 'C') {
    if (last === 'O') return { bg: '#A0B0C0', text: '#1e293b' }
    if (last === 'F' || last === 'S') return { bg: '#667788', text: '#ffffff' }
    return { bg: '#8899AA', text: '#ffffff' }
  }

  // Managers
  if (first === 'M') {
    if (last === 'O') return { bg: '#4A90C4', text: '#ffffff' }
    if (last === 'M') return { bg: '#6BAED6', text: '#1e293b' }
    if (last === 'F' || last === 'S') return { bg: '#2C5F8A', text: '#ffffff' }
    return { bg: '#4A90C4', text: '#ffffff' }
  }

  // Employés
  if (first === 'E') {
    if (c.includes('L')) return { bg: '#C47A4A', text: '#ffffff' }
    if (last === 'O') return { bg: '#5BA55B', text: '#ffffff' }
    if (last === 'M') return { bg: '#7BC47B', text: '#1e293b' }
    if (last === 'F' || last === 'S') return { bg: '#3A7A3A', text: '#ffffff' }
    return { bg: '#5BA55B', text: '#ffffff' }
  }

  return { bg: '#f3f4f6', text: '#374151' }
}
