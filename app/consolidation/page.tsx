'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { useSite } from '@/lib/site-context'
import { isAdmin, getCodeColor } from '@/lib/utils'
import { sortEmployees } from '@/lib/employeeUtils'
import { teamLabel } from '@/lib/teamUtils'
import { Layers } from 'lucide-react'

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const DAY_LETTER = ['D','L','M','M','J','V','S']

function pad(n: number) { return String(n).padStart(2, '0') }
function getDays(year: number, month: number): Date[] {
  const n = new Date(year, month + 1, 0).getDate()
  return Array.from({ length: n }, (_, i) => new Date(year, month, i + 1))
}
function fmtH(h: number): string {
  if (h === 0) return ''
  return (Math.round(h * 100) / 100).toFixed(2)
}

type Team = { id: string; name: string; cdpf: string | null; letter: string | null; site_id: string | null }
type ShiftCode = { code: string; paid_hours: number | null; color?: string | null }
type CellEntry = { teamId: string; code: string }
type EmpRow = {
  id: string
  first_name: string
  last_name: string
  statut: string | null
  contract_type: string
  teamIds: string[]
}

const COL_NOM = 120
const COL_PRENOM = 90
const COL_EQ = 60

export default function ConsolidationPage() {
  const now = new Date()
  const { role, allowedSiteId: userSiteId } = useAuth()
  const { sites, selectedSiteId: globalSiteId } = useSite()

  const [localSiteId, setLocalSiteId] = useState<string | null>(null)
  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear] = useState(now.getFullYear())
  const [allTeams, setAllTeams] = useState<Team[]>([])
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
  const [shiftCodes, setShiftCodes] = useState<ShiftCode[]>([])
  const [empMap, setEmpMap] = useState<Record<string, EmpRow>>({})
  const [scheduleMap, setScheduleMap] = useState<Record<string, Record<string, CellEntry[]>>>({})
  const [teamBudget, setTeamBudget] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)

  const canView = isAdmin(role) || role === 'responsable'

  // Init localSiteId depuis le contexte global
  useEffect(() => {
    if (role === 'responsable' && userSiteId) {
      setLocalSiteId(userSiteId)
    } else if (globalSiteId) {
      setLocalSiteId(prev => prev ?? globalSiteId)
    } else if (sites.length > 0) {
      setLocalSiteId(prev => prev ?? sites[0].id)
    }
  }, [role, userSiteId, globalSiteId, sites])

  // Charge équipes + codes pour le site
  useEffect(() => {
    if (!localSiteId) return
    setAllTeams([])
    setSelectedTeamIds([])
    Promise.all([
      supabase.from('teams').select('id, name, cdpf, letter, site_id').eq('site_id', localSiteId).order('name'),
      supabase.from('shift_codes').select('code, paid_hours, color').order('code'),
    ]).then(([tRes, scRes]) => {
      const teams = (tRes.data ?? []) as Team[]
      setAllTeams(teams)
      setSelectedTeamIds(teams.map(t => t.id))
      setShiftCodes(scRes.data ?? [])
    })
  }, [localSiteId])

  // Charge employees + schedules + budget
  const loadData = useCallback(async () => {
    if (selectedTeamIds.length === 0) {
      setEmpMap({})
      setScheduleMap({})
      setTeamBudget({})
      return
    }
    setLoading(true)
    try {
      const startDate = `${year}-${pad(month + 1)}-01`
      const lastDay = new Date(year, month + 1, 0).getDate()
      const endDate = `${year}-${pad(month + 1)}-${pad(lastDay)}`

      const [etRes, schedRes, calRes] = await Promise.all([
        supabase.from('employee_teams')
          .select('employee_id, team_id, employees(id, first_name, last_name, contract_type, weekly_contract_hours, statut, is_active, start_date, end_date)')
          .in('team_id', selectedTeamIds),
        supabase.from('schedules')
          .select('employee_id, team_id, date, code')
          .in('team_id', selectedTeamIds)
          .gte('date', startDate)
          .lte('date', endDate)
          .not('code', 'is', null)
          .neq('code', ''),
        supabase.from('annual_calendar')
          .select('team_id, date, structure_id')
          .in('team_id', selectedTeamIds)
          .gte('date', startDate)
          .lte('date', endDate),
      ])

      // Build employee map (unique par id)
      const newEmpMap: Record<string, EmpRow> = {}
      for (const et of (etRes.data ?? []) as any[]) {
        const e = et.employees
        if (!e || !e.is_active) continue
        if (e.start_date && e.start_date > endDate) continue
        if (e.end_date && e.end_date < startDate) continue
        if (!newEmpMap[e.id]) {
          newEmpMap[e.id] = {
            id: e.id,
            first_name: e.first_name,
            last_name: e.last_name,
            statut: e.statut ?? null,
            contract_type: e.contract_type ?? '',
            teamIds: [],
          }
        }
        if (!newEmpMap[e.id].teamIds.includes(et.team_id)) {
          newEmpMap[e.id].teamIds.push(et.team_id)
        }
      }
      setEmpMap(newEmpMap)

      // Build schedule map: empId -> date -> [{teamId, code}]
      const newSchedMap: Record<string, Record<string, CellEntry[]>> = {}
      for (const s of (schedRes.data ?? []) as any[]) {
        if (!s.code) continue
        if (!newSchedMap[s.employee_id]) newSchedMap[s.employee_id] = {}
        if (!newSchedMap[s.employee_id][s.date]) newSchedMap[s.employee_id][s.date] = []
        const existing = newSchedMap[s.employee_id][s.date]
        if (!existing.find(c => c.teamId === s.team_id)) {
          existing.push({ teamId: s.team_id, code: s.code })
        }
      }
      setScheduleMap(newSchedMap)

      // Budget depuis calendrier annuel + staffing_structure_positions
      const structureIds = [...new Set((calRes.data ?? []).map((c: any) => c.structure_id).filter(Boolean))]
      const newBudget: Record<string, number> = {}
      if (structureIds.length && shiftCodes.length) {
        const scHours: Record<string, number> = {}
        for (const sc of shiftCodes) {
          if (sc.code) scHours[sc.code] = Number(sc.paid_hours ?? 0)
        }
        const { data: spData } = await supabase
          .from('staffing_structure_positions')
          .select('structure_id, position_name, required_count')
          .in('structure_id', structureIds)
        const structHours: Record<string, number> = {}
        for (const sp of (spData ?? []) as any[]) {
          const h = scHours[sp.position_name] ?? 0
          structHours[sp.structure_id] = (structHours[sp.structure_id] ?? 0) + h * sp.required_count
        }
        for (const c of (calRes.data ?? []) as any[]) {
          if (!c.structure_id) continue
          newBudget[c.team_id] = (newBudget[c.team_id] ?? 0) + (structHours[c.structure_id] ?? 0)
        }
      }
      setTeamBudget(newBudget)
    } finally {
      setLoading(false)
    }
  }, [selectedTeamIds, month, year, shiftCodes])

  useEffect(() => { loadData() }, [loadData])

  // ─── Computed ─────────────────────────────────────────────────────────────
  const days = useMemo(() => getDays(year, month), [year, month])

  const sortedEmployees = useMemo(() => {
    const list = Object.values(empMap)
    const { permanents, temporaires } = sortEmployees(list)
    return [...permanents, ...temporaires]
  }, [empMap])

  const selectedTeams = useMemo(
    () => allTeams.filter(t => selectedTeamIds.includes(t.id)),
    [allTeams, selectedTeamIds]
  )

  function getPaidHours(code: string): number {
    return Number(shiftCodes.find(c => c.code === code)?.paid_hours ?? 0)
  }

  function getCells(empId: string, dateStr: string): CellEntry[] {
    return scheduleMap[empId]?.[dateStr] ?? []
  }

  function isConflict(cells: CellEntry[]): boolean {
    if (cells.length <= 1) return false
    return new Set(cells.map(c => c.teamId)).size > 1
  }

  function getEmpTotalHours(empId: string): number {
    let total = 0
    for (const date of Object.keys(scheduleMap[empId] ?? {})) {
      for (const c of scheduleMap[empId][date]) total += getPaidHours(c.code)
    }
    return total
  }

  function getTeamDayHours(teamId: string, dateStr: string): number {
    let total = 0
    for (const empId of Object.keys(scheduleMap)) {
      for (const c of (scheduleMap[empId][dateStr] ?? [])) {
        if (c.teamId === teamId) total += getPaidHours(c.code)
      }
    }
    return total
  }

  function getTeamMonthHours(teamId: string): number {
    return days.reduce((sum, d) => {
      return sum + getTeamDayHours(teamId, `${year}-${pad(month + 1)}-${pad(d.getDate())}`)
    }, 0)
  }

  function getTeamActiveEmps(teamId: string): number {
    const ids = new Set<string>()
    for (const empId of Object.keys(scheduleMap)) {
      for (const date of Object.keys(scheduleMap[empId])) {
        if (scheduleMap[empId][date].some(c => c.teamId === teamId)) ids.add(empId)
      }
    }
    return ids.size
  }

  function getTeamShortLabel(teamId: string): string {
    const t = allTeams.find(x => x.id === teamId)
    if (!t) return '?'
    return t.letter || t.cdpf || t.name.slice(0, 3).toUpperCase()
  }

  function ecartColorClass(planned: number, budget: number): string {
    if (budget === 0) return 'text-gray-500'
    const pct = (planned - budget) / budget * 100
    if (pct <= 0) return 'text-green-600'
    if (pct <= 5) return 'text-orange-500'
    return 'text-red-600'
  }

  function ecartColorLight(planned: number, budget: number): string {
    if (budget === 0) return 'text-gray-300'
    const pct = (planned - budget) / budget * 100
    if (pct <= 0) return 'text-green-300'
    if (pct <= 5) return 'text-orange-300'
    return 'text-red-300'
  }

  const totalBudget = selectedTeamIds.reduce((s, tid) => s + (teamBudget[tid] ?? 0), 0)
  const totalPlanned = selectedTeams.reduce((s, t) => s + getTeamMonthHours(t.id), 0)
  const totalEcart = totalPlanned - totalBudget
  const totalEcartPct = totalBudget > 0 ? totalEcart / totalBudget * 100 : 0

  // ─── Excel export ─────────────────────────────────────────────────────────
  async function handleExport() {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const today = new Date()
    const fileDate = `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`
    const siteName = (sites.find(s => s.id === localSiteId)?.name ?? 'Site').replace(/\s+/g, '_')

    // Synthèse
    const synRows: any[][] = [
      ['Équipe', 'Nb salariés', 'Heures budget', 'Heures planifiées', 'Écart', 'Écart %'],
    ]
    let tBudget = 0, tPlanned = 0
    for (const team of selectedTeams) {
      const budget = teamBudget[team.id] ?? 0
      const planned = getTeamMonthHours(team.id)
      const nb = getTeamActiveEmps(team.id)
      const ecart = planned - budget
      const ecartPct = budget > 0 ? ecart / budget * 100 : null
      tBudget += budget
      tPlanned += planned
      synRows.push([teamLabel(team), nb, +budget.toFixed(2), +planned.toFixed(2), +ecart.toFixed(2), ecartPct !== null ? +ecartPct.toFixed(1) : ''])
    }
    const tEcart = tPlanned - tBudget
    synRows.push(['TOTAL SITE', sortedEmployees.length, +tBudget.toFixed(2), +tPlanned.toFixed(2), +tEcart.toFixed(2), tBudget > 0 ? +(tEcart / tBudget * 100).toFixed(1) : ''])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(synRows), 'Synthese')

    // Détail
    const detRows: any[][] = [
      ['Nom', 'Prénom', 'Équipe(s)', ...days.map(d => d.getDate()), 'Total h'],
    ]
    for (const emp of sortedEmployees) {
      let totalH = 0
      const row: any[] = [emp.last_name, emp.first_name, emp.teamIds.map(t => getTeamShortLabel(t)).join(', ')]
      for (const d of days) {
        const ds = `${year}-${pad(month + 1)}-${pad(d.getDate())}`
        const cells = getCells(emp.id, ds)
        if (!cells.length) {
          row.push('')
        } else {
          row.push(cells.map(c => c.code).join('/'))
          for (const c of cells) totalH += getPaidHours(c.code)
        }
      }
      row.push(+totalH.toFixed(2))
      detRows.push(row)
    }
    for (const team of selectedTeams) {
      const row: any[] = [`Total ${teamLabel(team)}`, '', '']
      let teamTotal = 0
      for (const d of days) {
        const ds = `${year}-${pad(month + 1)}-${pad(d.getDate())}`
        const h = getTeamDayHours(team.id, ds)
        row.push(h > 0 ? +h.toFixed(2) : '')
        teamTotal += h
      }
      row.push(+teamTotal.toFixed(2))
      detRows.push(row)
    }
    if (selectedTeams.length > 1) {
      const row: any[] = ['TOTAL GÉNÉRAL', '', '']
      let grandTotal = 0
      for (const d of days) {
        const ds = `${year}-${pad(month + 1)}-${pad(d.getDate())}`
        const h = selectedTeams.reduce((s, t) => s + getTeamDayHours(t.id, ds), 0)
        row.push(h > 0 ? +h.toFixed(2) : '')
        grandTotal += h
      }
      row.push(+grandTotal.toFixed(2))
      detRows.push(row)
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detRows), 'Detail')
    XLSX.writeFile(wb, `${fileDate}_Consolidation_${siteName}_${MONTHS[month]}_${year}.xlsx`)
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  if (role && !canView) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-500">Accès non autorisé.</p>
      </div>
    )
  }

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  return (
    <div className="p-6 min-h-full">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-2 mr-2">
          <Layers className="h-5 w-5 text-slate-600" strokeWidth={1.5} />
          <h1 className="text-lg font-bold text-slate-900">Consolidation multi-équipes</h1>
        </div>

        {role === 'responsable' ? (
          <span className="text-sm font-medium text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
            {sites.find(s => s.id === localSiteId)?.name ?? ''}
          </span>
        ) : (
          <select
            value={localSiteId ?? ''}
            onChange={e => setLocalSiteId(e.target.value || null)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}

        <select
          value={month}
          onChange={e => setMonth(+e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>

        <select
          value={year}
          onChange={e => setYear(+e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <button
          onClick={handleExport}
          disabled={loading || sortedEmployees.length === 0}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-40 transition-colors"
        >
          Exporter Excel
        </button>
      </div>

      {/* ── Sélecteur équipes ── */}
      {allTeams.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
          {allTeams.map(team => (
            <label key={team.id} className="flex items-center gap-1.5 cursor-pointer select-none text-sm">
              <input
                type="checkbox"
                checked={selectedTeamIds.includes(team.id)}
                onChange={() => setSelectedTeamIds(prev =>
                  prev.includes(team.id) ? prev.filter(id => id !== team.id) : [...prev, team.id]
                )}
                className="rounded border-gray-300"
              />
              <span className="font-semibold text-slate-800">{getTeamShortLabel(team.id)}</span>
              <span className="text-gray-500">{team.name}</span>
            </label>
          ))}
          {allTeams.length > 1 && (
            <button
              onClick={() => setSelectedTeamIds(
                selectedTeamIds.length === allTeams.length ? [] : allTeams.map(t => t.id)
              )}
              className="text-xs text-blue-600 hover:underline ml-1"
            >
              {selectedTeamIds.length === allTeams.length ? 'Tout décocher' : 'Tout cocher'}
            </button>
          )}
        </div>
      )}

      {loading && (
        <div className="text-sm text-gray-400 mb-4 animate-pulse">Chargement…</div>
      )}

      {/* ── Synthèse ── */}
      {!loading && selectedTeams.length > 0 && (
        <div className="mb-6 overflow-x-auto">
          <table className="text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100">
                {['Équipe', 'Nb salariés', 'Budget (h)', 'Planifié (h)', 'Écart', 'Écart %'].map(h => (
                  <th key={h} className={`px-3 py-2 font-semibold text-slate-700 border border-slate-200 ${h === 'Équipe' ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selectedTeams.map(team => {
                const budget = teamBudget[team.id] ?? 0
                const planned = getTeamMonthHours(team.id)
                const nb = getTeamActiveEmps(team.id)
                const ecart = planned - budget
                const ecartPct = budget > 0 ? ecart / budget * 100 : null
                const col = ecartColorClass(planned, budget)
                return (
                  <tr key={team.id} className="hover:bg-slate-50 border-b border-slate-100">
                    <td className="px-3 py-2 font-medium border border-slate-200">{teamLabel(team)}</td>
                    <td className="px-3 py-2 text-right border border-slate-200">{nb}</td>
                    <td className="px-3 py-2 text-right font-mono border border-slate-200">{budget > 0 ? budget.toFixed(2) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono border border-slate-200">{planned > 0 ? planned.toFixed(2) : '—'}</td>
                    <td className={`px-3 py-2 text-right font-mono font-medium border border-slate-200 ${col}`}>
                      {budget > 0 ? (ecart > 0 ? '+' : '') + ecart.toFixed(2) : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right font-medium border border-slate-200 ${col}`}>
                      {ecartPct !== null ? (ecartPct > 0 ? '+' : '') + ecartPct.toFixed(1) + '%' : '—'}
                    </td>
                  </tr>
                )
              })}
              <tr className="bg-slate-900 text-white font-semibold">
                <td className="px-3 py-2 border border-slate-700">TOTAL SITE</td>
                <td className="px-3 py-2 text-right border border-slate-700">{sortedEmployees.length}</td>
                <td className="px-3 py-2 text-right font-mono border border-slate-700">{totalBudget > 0 ? totalBudget.toFixed(2) : '—'}</td>
                <td className="px-3 py-2 text-right font-mono border border-slate-700">{totalPlanned > 0 ? totalPlanned.toFixed(2) : '—'}</td>
                <td className={`px-3 py-2 text-right font-mono border border-slate-700 ${ecartColorLight(totalPlanned, totalBudget)}`}>
                  {totalBudget > 0 ? (totalEcart > 0 ? '+' : '') + totalEcart.toFixed(2) : '—'}
                </td>
                <td className={`px-3 py-2 text-right border border-slate-700 ${ecartColorLight(totalPlanned, totalBudget)}`}>
                  {totalBudget > 0 ? (totalEcartPct > 0 ? '+' : '') + totalEcartPct.toFixed(1) + '%' : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── Grille consolidée ── */}
      {!loading && sortedEmployees.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-sm">
          <table className="text-xs border-collapse" style={{ minWidth: `${COL_NOM + COL_PRENOM + COL_EQ + days.length * 38 + 64}px` }}>
            <thead>
              <tr className="bg-slate-100">
                <th className="bg-slate-100 border-b border-r border-slate-200 px-2 py-2 text-left font-semibold text-slate-700 whitespace-nowrap" style={{ position: 'sticky', left: 0, zIndex: 20, minWidth: COL_NOM }}>
                  Nom
                </th>
                <th className="bg-slate-100 border-b border-r border-slate-200 px-2 py-2 text-left font-semibold text-slate-700 whitespace-nowrap" style={{ position: 'sticky', left: COL_NOM, zIndex: 20, minWidth: COL_PRENOM }}>
                  Prénom
                </th>
                <th className="bg-slate-100 border-b border-r border-slate-200 px-2 py-2 text-center font-semibold text-slate-700 whitespace-nowrap" style={{ position: 'sticky', left: COL_NOM + COL_PRENOM, zIndex: 20, minWidth: COL_EQ }}>
                  Éq.
                </th>
                {days.map(d => {
                  const dow = d.getDay()
                  const isWe = dow === 0 || dow === 6
                  return (
                    <th key={d.getDate()} className={`border-b border-r border-slate-200 px-0 py-1 text-center font-semibold ${isWe ? 'bg-slate-200 text-slate-400' : 'bg-slate-100 text-slate-700'}`} style={{ minWidth: 38 }}>
                      <div className="text-[9px] leading-none">{DAY_LETTER[dow]}</div>
                      <div className="text-[11px] leading-tight">{d.getDate()}</div>
                    </th>
                  )
                })}
                <th className="bg-slate-100 border-b border-l border-slate-200 px-2 py-2 text-right font-semibold text-slate-700 whitespace-nowrap" style={{ position: 'sticky', right: 0, zIndex: 20, minWidth: 64 }}>
                  Total h
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedEmployees.map((emp, idx) => {
                const bg = idx % 2 === 0 ? '#ffffff' : '#f9fafb'
                const totalH = getEmpTotalHours(emp.id)
                return (
                  <tr key={emp.id}>
                    <td className="border-b border-r border-slate-100 px-2 py-1.5 font-medium text-slate-900 whitespace-nowrap" style={{ position: 'sticky', left: 0, zIndex: 10, background: bg, minWidth: COL_NOM }}>
                      {emp.last_name}
                    </td>
                    <td className="border-b border-r border-slate-100 px-2 py-1.5 text-slate-700 whitespace-nowrap" style={{ position: 'sticky', left: COL_NOM, zIndex: 10, background: bg, minWidth: COL_PRENOM }}>
                      {emp.first_name}
                    </td>
                    <td className="border-b border-r border-slate-100 px-2 py-1.5 text-center text-slate-500 whitespace-nowrap" style={{ position: 'sticky', left: COL_NOM + COL_PRENOM, zIndex: 10, background: bg, minWidth: COL_EQ }}>
                      {emp.teamIds.map(t => getTeamShortLabel(t)).join(',')}
                    </td>
                    {days.map(d => {
                      const ds = `${year}-${pad(month + 1)}-${pad(d.getDate())}`
                      const cells = getCells(emp.id, ds)
                      const conflict = isConflict(cells)
                      const dow = d.getDay()
                      const isWe = dow === 0 || dow === 6

                      if (conflict) {
                        return (
                          <td key={d.getDate()} className="border-b border-r border-slate-100 px-0.5 py-0.5 text-center" style={{ background: bg }}>
                            <div
                              className="rounded font-bold leading-tight px-0.5 py-0.5"
                              style={{ fontSize: 9, background: '#ef4444', color: '#fff' }}
                              title={`Conflit : ${cells.map(c => `${getTeamShortLabel(c.teamId)}=${c.code}`).join(', ')}`}
                            >
                              {cells.map(c => c.code).join('/')}
                            </div>
                          </td>
                        )
                      }

                      const code = cells[0]?.code ?? ''
                      if (!code) {
                        return (
                          <td key={d.getDate()} className="border-b border-r border-slate-100" style={{ background: isWe ? '#f1f5f9' : bg, minWidth: 38 }} />
                        )
                      }

                      const { bg: codeBg, text: codeText } = getCodeColor(code, shiftCodes as any, [])
                      return (
                        <td key={d.getDate()} className="border-b border-r border-slate-100 px-0.5 py-0.5 text-center" style={{ background: bg }}>
                          <div
                            className="rounded font-semibold leading-tight px-0.5 py-0.5"
                            style={{ fontSize: 10, background: codeBg, color: codeText }}
                          >
                            {code}
                          </div>
                        </td>
                      )
                    })}
                    <td className="border-b border-l border-slate-100 px-2 py-1.5 text-right font-mono text-slate-700" style={{ position: 'sticky', right: 0, zIndex: 10, background: bg }}>
                      {fmtH(totalH)}
                    </td>
                  </tr>
                )
              })}

              {/* Lignes totaux par équipe */}
              {selectedTeams.map(team => {
                const teamMonthH = getTeamMonthHours(team.id)
                return (
                  <tr key={`tot-${team.id}`} className="font-semibold">
                    <td className="border-t-2 border-b border-r border-slate-300 px-2 py-1.5 text-slate-700 text-xs whitespace-nowrap" style={{ position: 'sticky', left: 0, zIndex: 10, background: '#f1f5f9', minWidth: COL_NOM }}>
                      Éq. {getTeamShortLabel(team.id)}
                    </td>
                    <td className="border-t-2 border-b border-r border-slate-300 px-2 py-1.5 text-slate-500 text-xs whitespace-nowrap" style={{ position: 'sticky', left: COL_NOM, zIndex: 10, background: '#f1f5f9', minWidth: COL_PRENOM }}>
                      {team.name}
                    </td>
                    <td className="border-t-2 border-b border-r border-slate-300" style={{ position: 'sticky', left: COL_NOM + COL_PRENOM, zIndex: 10, background: '#f1f5f9', minWidth: COL_EQ }} />
                    {days.map(d => {
                      const ds = `${year}-${pad(month + 1)}-${pad(d.getDate())}`
                      const h = getTeamDayHours(team.id, ds)
                      return (
                        <td key={d.getDate()} className="border-t-2 border-b border-r border-slate-300 text-center font-mono text-slate-600" style={{ fontSize: 10, minWidth: 38 }}>
                          {h > 0 ? h.toFixed(1) : ''}
                        </td>
                      )
                    })}
                    <td className="border-t-2 border-b border-l border-slate-300 px-2 py-1.5 text-right font-mono text-slate-700" style={{ position: 'sticky', right: 0, zIndex: 10, background: '#f1f5f9' }}>
                      {fmtH(teamMonthH)}
                    </td>
                  </tr>
                )
              })}

              {/* Ligne total général */}
              {selectedTeams.length > 1 && (() => {
                const grandTotal = selectedTeams.reduce((s, t) => s + getTeamMonthHours(t.id), 0)
                return (
                  <tr className="font-bold text-white">
                    <td className="border-t border-slate-700 px-2 py-2 whitespace-nowrap text-xs" style={{ position: 'sticky', left: 0, zIndex: 10, background: '#1e293b', minWidth: COL_NOM }}>
                      TOTAL GÉNÉRAL
                    </td>
                    <td className="border-t border-slate-700" style={{ position: 'sticky', left: COL_NOM, zIndex: 10, background: '#1e293b', minWidth: COL_PRENOM }} />
                    <td className="border-t border-r border-slate-700" style={{ position: 'sticky', left: COL_NOM + COL_PRENOM, zIndex: 10, background: '#1e293b', minWidth: COL_EQ }} />
                    {days.map(d => {
                      const ds = `${year}-${pad(month + 1)}-${pad(d.getDate())}`
                      const h = selectedTeams.reduce((s, t) => s + getTeamDayHours(t.id, ds), 0)
                      return (
                        <td key={d.getDate()} className="border-t border-r border-slate-700 text-center font-mono" style={{ background: '#1e293b', fontSize: 10, minWidth: 38 }}>
                          {h > 0 ? h.toFixed(1) : ''}
                        </td>
                      )
                    })}
                    <td className="border-t border-l border-slate-700 px-2 py-2 text-right font-mono" style={{ position: 'sticky', right: 0, zIndex: 10, background: '#1e293b' }}>
                      {fmtH(grandTotal)}
                    </td>
                  </tr>
                )
              })()}
            </tbody>
          </table>
        </div>
      )}

      {!loading && sortedEmployees.length === 0 && selectedTeamIds.length > 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">
          Aucun salarié trouvé pour les équipes sélectionnées sur cette période.
        </div>
      )}

      {!loading && selectedTeamIds.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">
          Sélectionnez au moins une équipe.
        </div>
      )}
    </div>
  )
}
