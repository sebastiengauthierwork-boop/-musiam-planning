'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Employee, Schedule, TabProps, Team } from './types'
import { teamLabel } from '@/lib/teamUtils'
import { loadTeamData } from '@/lib/planning-data'
import { supabase } from '@/lib/supabase'

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const DAY_LETTER = ['D','L','M','M','J','V','S']

function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function getDays(year: number, month: number): Date[] {
  const n = new Date(year, month + 1, 0).getDate()
  return Array.from({ length: n }, (_, i) => new Date(year, month, i + 1))
}
function getMonday(d: Date): Date {
  const r = new Date(d)
  const day = r.getDay()
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1))
  return r
}
/** Centièmes display: 7.80 — returns '' if h === 0 */
function fmtDecimal(h: number): string {
  if (h === 0) return ''
  return (Math.round(h * 100) / 100).toFixed(2)
}

type TeamData = { employees: Employee[]; schedules: Schedule[] }

export default function TabCompteur({ shiftCodes, year, month, teamId, teams = [] }: TabProps) {
  const days = getDays(year, month)

  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([teamId])
  const [teamDataMap, setTeamDataMap] = useState<Record<string, TeamData>>({})
  const [structureBudgetMap, setStructureBudgetMap] = useState<Record<string, Record<string, number>>>({})
  const [loading, setLoading] = useState(false)

  // ─── Data loading ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!selectedTeamIds.length) { setTeamDataMap({}); setStructureBudgetMap({}); return }
    setLoading(true)
    try {
      const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
      const lastDay = new Date(year, month + 1, 0).getDate()
      const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

      const [results, calRes] = await Promise.all([
        Promise.all(selectedTeamIds.map(tid => loadTeamData(tid, month, year))),
        supabase.from('annual_calendar')
          .select('team_id, date, structure_id')
          .in('team_id', selectedTeamIds)
          .gte('date', startDate)
          .lte('date', endDate),
      ])

      const newMap: Record<string, TeamData> = {}
      selectedTeamIds.forEach((tid, i) => { newMap[tid] = results[i] })
      setTeamDataMap(newMap)

      // Budget structure par équipe par jour
      const structureIds = [...new Set((calRes.data ?? []).map((c: any) => c.structure_id).filter(Boolean))]
      const budgetMap: Record<string, Record<string, number>> = {}

      if (structureIds.length) {
        const scMap: Record<string, number> = {}
        for (const sc of shiftCodes) {
          if (sc.code && !(sc.code in scMap)) scMap[sc.code] = Number(sc.paid_hours ?? 0)
        }
        const { data: spData } = await supabase
          .from('staffing_structure_positions')
          .select('structure_id, position_name, required_count')
          .in('structure_id', structureIds)

        const structHoursMap: Record<string, number> = {}
        for (const sp of spData ?? []) {
          const h = scMap[sp.position_name] ?? 0
          structHoursMap[sp.structure_id] = (structHoursMap[sp.structure_id] ?? 0) + h * sp.required_count
        }
        for (const c of calRes.data ?? []) {
          if (!c.structure_id) continue
          if (!budgetMap[c.team_id]) budgetMap[c.team_id] = {}
          budgetMap[c.team_id][c.date] = (budgetMap[c.team_id][c.date] ?? 0) + (structHoursMap[c.structure_id] ?? 0)
        }
      }
      setStructureBudgetMap(budgetMap)
    } finally {
      setLoading(false)
    }
  }, [selectedTeamIds, month, year])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── Hours attribution ─────────────────────────────────────────────────────
  // Les codes sont par site — les heures comptent pour l'équipe du schedule
  function effectiveTeamId(schedule: Schedule): string {
    return schedule.team_id
  }

  function paidHours(schedule: Schedule): number {
    if (!schedule.code) return 0
    const sc = shiftCodes.find(c => c.code === schedule.code)
    return sc?.paid_hours ? Number(sc.paid_hours) : 0
  }

  // ─── Team toggles ─────────────────────────────────────────────────────────
  const allSelected = teams.length > 0 && selectedTeamIds.length === teams.length
  function toggleTeam(tid: string) {
    setSelectedTeamIds(prev => prev.includes(tid) ? prev.filter(id => id !== tid) : [...prev, tid])
  }
  function toggleAll() {
    setSelectedTeamIds(allSelected ? [] : teams.map(t => t.id))
  }

  // ─── Per-team per-day aggregations (by code team attribution) ─────────────
  function getDayHoursForTeam(tid: string, dateStr: string): { total: number; nbPersonnes: number } {
    const data = teamDataMap[tid]
    if (!data) return { total: 0, nbPersonnes: 0 }
    const relevant = data.schedules.filter(s => s.date === dateStr && effectiveTeamId(s) === tid)
    const empSet = new Set<string>()
    let total = 0
    for (const s of relevant) {
      const h = paidHours(s)
      if (h > 0) { total += h; empSet.add(s.employee_id) }
    }
    return { total, nbPersonnes: empSet.size }
  }

  function getEmpDayHoursForTeam(tid: string, empId: string, dateStr: string): number {
    const data = teamDataMap[tid]
    if (!data) return 0
    const s = data.schedules.find(sch =>
      sch.employee_id === empId && sch.date === dateStr && effectiveTeamId(sch) === tid
    )
    return s ? paidHours(s) : 0
  }

  function getEmpMonthHoursForTeam(tid: string, empId: string): number {
    return days.reduce((sum, d) => sum + getEmpDayHoursForTeam(tid, empId, toISO(d)), 0)
  }

  function getStructureBudgetForTeamDay(tid: string, dateStr: string): number {
    return structureBudgetMap[tid]?.[dateStr] ?? 0
  }

  function getStructureBudgetMonthForTeam(tid: string): number {
    return days.reduce((sum, d) => sum + getStructureBudgetForTeamDay(tid, toISO(d)), 0)
  }

  // Employees who have at least one schedule attributed to this team in the month
  function getActiveEmpsForTeam(tid: string): Employee[] {
    const data = teamDataMap[tid]
    if (!data) return []
    const activeIds = new Set<string>()
    for (const s of data.schedules) {
      if (effectiveTeamId(s) === tid && paidHours(s) > 0) activeIds.add(s.employee_id)
    }
    return data.employees.filter(e => activeIds.has(e.id))
  }

  // ─── Excel export ──────────────────────────────────────────────────────────

  /** Applique gras + fond gris sur la ligne r de la feuille ws (n colonnes). */
  function styleHeader(XLSX: any, ws: any, r: number, ncols: number) {
    for (let c = 0; c < ncols; c++) {
      const ref = XLSX.utils.encode_cell({ r, c })
      if (!ws[ref]) continue
      ws[ref].s = {
        font: { bold: true, color: { rgb: '1E293B' } },
        fill: { fgColor: { rgb: 'E2E8F0' }, patternType: 'solid' },
        alignment: { horizontal: c === 0 ? 'left' : 'center' },
        border: { bottom: { style: 'thin', color: { rgb: '94A3B8' } } },
      }
    }
  }

  /** Calcule la largeur max d'une colonne parmi toutes les lignes. */
  function colWidths(rows: any[][]): { wch: number }[] {
    if (!rows.length) return []
    const ncols = Math.max(...rows.map(r => r.length))
    return Array.from({ length: ncols }, (_, c) => ({
      wch: Math.max(
        ...rows.map(r => String(r[c] ?? '').length),
        10
      ) + 2,
    }))
  }

  async function handleExportExcel() {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()

    // ── Sheet 1: Résumé par jour ──
    const summaryRows: any[][] = []
    const summaryHeaderRows: number[] = [] // indices des lignes d'en-tête à styler

    for (const tid of selectedTeamIds) {
      const team = teams.find(t => t.id === tid)
      // Titre équipe
      summaryRows.push([`Équipe : ${team ? teamLabel(team) : tid}`])
      // En-tête
      summaryHeaderRows.push(summaryRows.length)
      summaryRows.push(['Jour', 'Total heures', 'Nb personnes', 'Moy h/personne'])

      let teamTotalH = 0; let teamTotalPersons = 0
      for (const d of days) {
        const dateStr = toISO(d)
        const { total, nbPersonnes } = getDayHoursForTeam(tid, dateStr)
        const moy = nbPersonnes > 0 ? total / nbPersonnes : 0
        summaryRows.push([
          `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`,
          total > 0 ? parseFloat(fmtDecimal(total) || '0') : 0,
          nbPersonnes,
          moy > 0 ? parseFloat((Math.round(moy * 100) / 100).toFixed(2)) : 0,
        ])
        teamTotalH += total; teamTotalPersons += nbPersonnes
      }
      const avgPersons = days.length > 0 ? teamTotalPersons / days.length : 0
      summaryRows.push([
        'TOTAL',
        parseFloat(fmtDecimal(teamTotalH) || '0'),
        teamTotalPersons,
        avgPersons > 0 ? parseFloat((Math.round(avgPersons * 100) / 100).toFixed(2)) : 0,
      ])
      summaryRows.push([])
    }
    const ws1 = XLSX.utils.aoa_to_sheet(summaryRows)
    ws1['!cols'] = colWidths(summaryRows)
    ws1['!views'] = [{ state: 'frozen', ySplit: 1 }]
    summaryHeaderRows.forEach(r => styleHeader(XLSX, ws1, r, 4))
    XLSX.utils.book_append_sheet(wb, ws1, 'Résumé par jour')

    // ── Sheet 2: Détail salariés ──
    const detailRows: any[][] = []
    const detailHeaderRows: number[] = []

    for (const tid of selectedTeamIds) {
      const team = teams.find(t => t.id === tid)
      detailRows.push([`Détail par salarié — ${team ? teamLabel(team) : tid}`])
      detailHeaderRows.push(detailRows.length)
      const header = ['Salarié', ...days.map(d => d.getDate()), 'Total']
      detailRows.push(header)

      const activeEmps = getActiveEmpsForTeam(tid)
      const dayTotals = new Array(days.length).fill(0)
      let grandTotal = 0
      for (const emp of activeEmps) {
        const row: any[] = [`${emp.last_name} ${emp.first_name}`]
        let empTotal = 0
        days.forEach((d, i) => {
          const h = getEmpDayHoursForTeam(tid, emp.id, toISO(d))
          row.push(h > 0 ? parseFloat(fmtDecimal(h) || '0') : '')
          dayTotals[i] += h
          empTotal += h
        })
        row.push(parseFloat(fmtDecimal(empTotal) || '0'))
        grandTotal += empTotal
        detailRows.push(row)
      }
      const totalRow: any[] = ['TOTAL', ...dayTotals.map(h => h > 0 ? parseFloat(fmtDecimal(h) || '0') : ''), parseFloat(fmtDecimal(grandTotal) || '0')]
      detailRows.push(totalRow)
      detailRows.push([])
    }
    const ws2 = XLSX.utils.aoa_to_sheet(detailRows)
    ws2['!cols'] = colWidths(detailRows)
    ws2['!views'] = [{ state: 'frozen', ySplit: 1 }]
    detailHeaderRows.forEach(r => styleHeader(XLSX, ws2, r, days.length + 2))
    XLSX.utils.book_append_sheet(wb, ws2, 'Détail salariés')

    // Nom de fichier : compteur_heures_[equipe(s)]_[mois]_[annee].xlsx
    const teamSlug = selectedTeamIds.length === 1
      ? (teams.find(t => t.id === selectedTeamIds[0])?.name ?? 'equipe')
          .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      : `${selectedTeamIds.length}-equipes`
    XLSX.writeFile(wb, `compteur_heures_${teamSlug}_${MONTHS[month].toLowerCase()}_${year}.xlsx`, { cellStyles: true })
  }

  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6

  return (
    <div className="flex flex-col h-full">

      {/* ── Top bar: team checkboxes + export ── */}
      <div className="shrink-0 px-6 py-3 border-b border-gray-200 bg-white flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-gray-700">Équipes :</span>

        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-slate-700" />
          <span className="font-medium">Toutes</span>
        </label>

        <span className="text-gray-300">|</span>

        {teams.map(t => (
          <label key={t.id} className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selectedTeamIds.includes(t.id)}
              onChange={() => toggleTeam(t.id)}
              className="accent-slate-700"
            />
            {teamLabel(t)}
          </label>
        ))}

        <div className="ml-auto">
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-green-200 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            Exporter Excel
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-auto bg-gray-50/50">
        {loading ? (
          <div className="p-6 animate-pulse space-y-3">
            <div className="h-5 bg-gray-200 rounded w-40 mb-4" />
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 h-8 bg-white rounded-lg border border-gray-100 px-3">
                <div className="h-3 bg-gray-200 rounded" style={{ width: [120,96,140,104,88,128,112,100][i] }} />
                <div className="ml-auto flex gap-2">
                  {[0,1,2,3,4].map(w => <div key={w} className="w-12 h-4 bg-gray-100 rounded" />)}
                  <div className="w-14 h-4 bg-gray-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : selectedTeamIds.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Sélectionnez au moins une équipe.</div>
        ) : (
          <div className="p-6 space-y-10">

            {/* ══════════════════ PARTIE HAUTE ══════════════════ */}
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                <span className="inline-block h-px flex-1 bg-slate-200" />
                Résumé par jour
                <span className="inline-block h-px flex-1 bg-slate-200" />
              </h2>

              <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))' }}>
                {selectedTeamIds.map(tid => {
                  const team = teams.find(t => t.id === tid)
                  let totalH = 0; let totalPersons = 0

                  return (
                    <div key={tid} className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                      <div className="px-4 py-2.5 bg-slate-800 text-slate-100 text-xs font-semibold uppercase tracking-wider">
                        {team ? teamLabel(team) : tid}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-slate-600 text-[11px] uppercase tracking-wide">
                              <th className="px-3 py-2 text-left font-semibold w-20">Jour</th>
                              <th className="px-3 py-2 text-right font-semibold">Planifié</th>
                              <th className="px-3 py-2 text-right font-semibold">Budget struct.</th>
                              <th className="px-3 py-2 text-right font-semibold">Écart</th>
                              <th className="px-3 py-2 text-right font-semibold">Nb pers.</th>
                              <th className="px-3 py-2 text-right font-semibold">Moy h/pers</th>
                            </tr>
                          </thead>
                          <tbody>
                            {days.map(d => {
                              const dateStr = toISO(d)
                              const { total, nbPersonnes } = getDayHoursForTeam(tid, dateStr)
                              const structBudget = getStructureBudgetForTeamDay(tid, dateStr)
                              const ecart = structBudget > 0 ? total - structBudget : null
                              const moy = nbPersonnes > 0 ? total / nbPersonnes : 0
                              const isWE = isWeekend(d)
                              totalH += total; totalPersons += nbPersonnes
                              return (
                                <tr key={dateStr} className={`border-t border-gray-100 ${isWE ? 'bg-slate-50/70' : 'hover:bg-yellow-50/20'}`}>
                                  <td className={`px-3 py-1.5 font-medium ${isWE ? 'text-slate-400' : 'text-gray-700'}`}>
                                    <span className="mr-1 text-[10px] text-gray-400">{DAY_LETTER[d.getDay()]}</span>
                                    {d.getDate()}
                                  </td>
                                  <td className="px-3 py-1.5 text-right font-mono text-gray-700">
                                    {total > 0 ? fmtDecimal(total) : ''}
                                  </td>
                                  <td className="px-3 py-1.5 text-right font-mono text-gray-400">
                                    {structBudget > 0 ? fmtDecimal(structBudget) : ''}
                                  </td>
                                  <td className={`px-3 py-1.5 text-right font-mono font-semibold ${ecart === null ? '' : ecart > 0 ? 'text-red-500' : ecart < 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                                    {ecart === null ? '' : ecart === 0 ? '=' : ecart > 0 ? `+${fmtDecimal(ecart)}` : `−${fmtDecimal(Math.abs(ecart))}`}
                                  </td>
                                  <td className="px-3 py-1.5 text-right text-gray-600">
                                    {nbPersonnes > 0 ? nbPersonnes : ''}
                                  </td>
                                  <td className="px-3 py-1.5 text-right font-mono text-gray-500">
                                    {moy > 0 ? fmtDecimal(moy) : ''}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            {(() => {
                              const totalBudget = getStructureBudgetMonthForTeam(tid)
                              const totalEcart = totalBudget > 0 ? totalH - totalBudget : null
                              return (
                                <tr className="border-t-2 border-slate-300 bg-slate-800 text-white">
                                  <td className="px-3 py-2 font-bold text-xs uppercase">Total</td>
                                  <td className="px-3 py-2 text-right font-bold font-mono">{fmtDecimal(totalH) || '0.00'}</td>
                                  <td className="px-3 py-2 text-right font-mono text-slate-300">{totalBudget > 0 ? fmtDecimal(totalBudget) : '—'}</td>
                                  <td className={`px-3 py-2 text-right font-bold font-mono ${totalEcart === null ? 'text-slate-400' : totalEcart > 0 ? 'text-red-400' : totalEcart < 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                                    {totalEcart === null ? '—' : totalEcart === 0 ? '=' : totalEcart > 0 ? `+${fmtDecimal(totalEcart)}` : `−${fmtDecimal(Math.abs(totalEcart))}`}
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold">{totalPersons}</td>
                                  <td className="px-3 py-2 text-right font-mono text-slate-300">
                                    {totalPersons > 0 ? fmtDecimal(totalH / days.length) : ''}
                                  </td>
                                </tr>
                              )
                            })()}
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* ══════════════════ PARTIE BASSE ══════════════════ */}
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                <span className="inline-block h-px flex-1 bg-slate-200" />
                Détail par salarié
                <span className="inline-block h-px flex-1 bg-slate-200" />
              </h2>

              <div className="space-y-6">
                {selectedTeamIds.map(tid => {
                  const team = teams.find(t => t.id === tid)
                  const activeEmps = getActiveEmpsForTeam(tid)

                  return (
                    <div key={tid} className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                      <div className="px-4 py-2.5 bg-slate-800 text-slate-100 text-xs font-semibold">
                        Détail par salarié — {team ? teamLabel(team) : tid}
                      </div>

                      {activeEmps.length === 0 ? (
                        <div className="flex items-center justify-center h-16 text-gray-400 text-xs">
                          Aucune donnée pour cette équipe ce mois-ci.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="text-xs border-collapse w-max min-w-full">
                            <thead className="sticky top-0 z-10">
                              <tr className="bg-slate-700 text-slate-100">
                                <th className="sticky left-0 z-20 bg-slate-700 px-3 py-2 text-left font-semibold min-w-[140px] border-r border-slate-600">
                                  Salarié
                                </th>
                                {days.map(d => {
                                  const isWE = isWeekend(d)
                                  return (
                                    <th key={toISO(d)}
                                      className={`px-1 py-2 text-center w-9 min-w-[36px] border-r border-slate-600 ${isWE ? 'bg-slate-600' : ''}`}>
                                      <div className="text-[9px] text-slate-400">{DAY_LETTER[d.getDay()]}</div>
                                      <div className={`font-bold text-xs ${isWE ? 'text-slate-300' : 'text-slate-100'}`}>{d.getDate()}</div>
                                    </th>
                                  )
                                })}
                                <th className="sticky right-0 z-20 bg-slate-800 px-3 py-2 text-center font-bold min-w-[60px] border-l-2 border-slate-500">
                                  Total
                                </th>
                              </tr>
                            </thead>

                            <tbody>
                              {activeEmps.map((emp, empIdx) => {
                                const empTotal = getEmpMonthHoursForTeam(tid, emp.id)
                                return (
                                  <tr key={emp.id} className={`${empIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-yellow-50 group`}>
                                    <td className={`sticky left-0 z-10 border-b border-r border-gray-100 px-3 py-1.5 whitespace-nowrap group-hover:bg-yellow-50 ${empIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                      <span className="font-semibold text-gray-800">{emp.last_name}</span>{' '}
                                      <span className="text-gray-500">{emp.first_name}</span>
                                    </td>
                                    {days.map(d => {
                                      const dateStr = toISO(d)
                                      const h = getEmpDayHoursForTeam(tid, emp.id, dateStr)
                                      const isWE = isWeekend(d)
                                      return (
                                        <td key={dateStr}
                                          className={`border-b border-r border-gray-100 text-center py-1.5 h-7 ${isWE ? 'bg-slate-50' : ''}`}>
                                          {h > 0 && <span className="font-mono text-gray-700">{fmtDecimal(h)}</span>}
                                        </td>
                                      )
                                    })}
                                    <td className="sticky right-0 z-10 bg-white group-hover:bg-yellow-50 border-b border-l-2 border-gray-200 text-center py-1.5 h-7 font-bold text-gray-800">
                                      {empTotal > 0 ? fmtDecimal(empTotal) : '—'}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>

                            {/* Total row */}
                            <tfoot className="sticky bottom-0 z-10">
                              <tr style={{ background: '#0f172a' }}>
                                <td className="sticky left-0 z-20 px-3 py-2 font-bold text-xs text-white uppercase tracking-wide" style={{ background: '#0f172a' }}>
                                  Total
                                </td>
                                {days.map(d => {
                                  const dateStr = toISO(d)
                                  const h = activeEmps.reduce((s, e) => s + getEmpDayHoursForTeam(tid, e.id, dateStr), 0)
                                  const isWE = isWeekend(d)
                                  return (
                                    <td key={dateStr}
                                      className={`border-r border-slate-700 text-center py-2 h-7 font-mono ${isWE ? 'text-slate-400' : h > 0 ? 'text-white font-medium' : 'text-slate-600'}`}>
                                      {h > 0 ? fmtDecimal(h) : ''}
                                    </td>
                                  )
                                })}
                                {(() => {
                                  const grand = activeEmps.reduce((s, e) => s + getEmpMonthHoursForTeam(tid, e.id), 0)
                                  return (
                                    <td className="sticky right-0 z-20 border-l-2 border-slate-600 text-center py-2 h-7 font-bold text-white text-sm" style={{ background: '#0f172a' }}>
                                      {fmtDecimal(grand) || '0.00'}
                                    </td>
                                  )
                                })()}
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>

          </div>
        )}
      </div>
    </div>
  )
}
