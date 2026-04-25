export const STATUT_ORDER: Record<string, number> = {
  cadre: 1,
  agent_de_maitrise: 2,
  employe: 3,
}

export function isTemporaire(contractType: string | null | undefined): boolean {
  const ct = (contractType ?? '').toUpperCase()
  return ct === 'EXTRA' || ct === 'INTERIM'
}

export function sortEmployees<T extends {
  contract_type: string | null | undefined
  statut?: string | null
  last_name: string
}>(employees: T[]): { permanents: T[]; temporaires: T[] } {
  const permanents = employees
    .filter(e => !isTemporaire(e.contract_type))
    .sort((a, b) => {
      const oa = STATUT_ORDER[a.statut ?? ''] ?? 3
      const ob = STATUT_ORDER[b.statut ?? ''] ?? 3
      if (oa !== ob) return oa - ob
      return (a.last_name || '').localeCompare(b.last_name || '')
    })

  const temporaires = employees
    .filter(e => isTemporaire(e.contract_type))
    .sort((a, b) => {
      const aU = (a.contract_type ?? '').toUpperCase()
      const bU = (b.contract_type ?? '').toUpperCase()
      if (aU !== bU) return aU === 'EXTRA' ? -1 : 1
      return (a.last_name || '').localeCompare(b.last_name || '')
    })

  return { permanents, temporaires }
}
