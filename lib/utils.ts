export function isAdmin(role: string | null | undefined): boolean {
  return role === 'superadmin' || role === 'admin'
}

export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === 'superadmin'
}
