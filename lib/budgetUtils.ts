export type PositionRow = { structure_id: string; position_name: string; required_count: number }

/** Construit un map structure_id → total heures payées pour cette structure. */
export function buildStructHoursMap(
  positions: PositionRow[],
  shiftCodeHours: Record<string, number>
): Record<string, number> {
  const map: Record<string, number> = {}
  for (const pos of positions) {
    map[pos.structure_id] = (map[pos.structure_id] ?? 0) + (shiftCodeHours[pos.position_name] ?? 0) * pos.required_count
  }
  return map
}

/** Calcule le budget total (en heures) depuis un tableau d'entrées calendrier + structHoursMap. */
export function computeBudgetFromCalEntries(
  calEntries: { structure_id: string | null | undefined }[],
  structHoursMap: Record<string, number>
): number {
  let total = 0
  for (const entry of calEntries) {
    if (entry.structure_id) total += structHoursMap[entry.structure_id] ?? 0
  }
  return total
}

/** Calcule le budget d'un mois depuis un calMap (date → structure_id) couvrant l'année entière. */
export function computeMonthBudget(
  calMap: Record<string, string | null | undefined>,
  structHoursMap: Record<string, number>,
  year: number,
  month: number  // 0-indexed
): number {
  const nDays = new Date(year, month + 1, 0).getDate()
  let total = 0
  for (let d = 1; d <= nDays; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const structId = calMap[dateStr]
    if (structId) total += structHoursMap[structId] ?? 0
  }
  return total
}

/** Formate des heures décimales en "Xh" ou "XhYY". */
export function fmtHMin(h: number): string {
  const abs = Math.abs(h)
  const hours = Math.floor(abs)
  const mins = Math.round((abs - hours) * 60)
  const str = mins === 0 ? `${hours}h` : `${hours}h${String(mins).padStart(2, '0')}`
  return h < 0 ? `−${str}` : str
}
