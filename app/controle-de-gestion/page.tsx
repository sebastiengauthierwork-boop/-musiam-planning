'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { useSite } from '@/lib/site-context'
import { isAdmin } from '@/lib/utils'
import { teamLabel } from '@/lib/teamUtils'
import TabCompteur from '@/app/planning/TabCompteur'
import type { ShiftCode } from '@/app/planning/types'

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

function pad(n: number) { return String(n).padStart(2, '0') }

type Team = { id: string; name: string; cdpf: string | null; site_id: string | null; type: string }
type CellEntry = { teamId: string; code: string }
type EmpRow = { id: string; teamIds: string[] }

export default function ControleDeGestionPage() {
  const now = new Date()
  const { role, allowedSiteId: userSiteId } = useAuth()
  const { sites, selectedSiteId: globalSiteId } = useSite()

  const [localSiteId, setLocalSiteId] = useState<string | null>(null)
  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear] = useState(now.getFullYear())
  const [activeTab, setActiveTab] = useState<'compteur' | 'synthese'>('compteur')

  const [allTeams, setAllTeams] = useState<Team[]>([])
  const [shiftCodes, setShiftCodes] = useState<ShiftCode[]>([])

  // Synthèse budgétaire state
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
  const [empMap, setEmpMap] = useState<Record<string, EmpRow>>({})
  const [scheduleMap, setScheduleMap] = useState<Record<string, Record<string, CellEntry[]>>>({})
  const [teamBudget, setTeamBudget] = useState<Record<string, number>>({})
  const [loadingBudget, setLoadingBudget] = useState(false)

  const canView = isAdmin(role) || role === 'responsable'

  useEffect(() => {
    if (role === 'responsable' && userSiteId) {
      setLocalSiteId(userSiteId)
    } else if (globalSiteId) {
      setLocalSiteId(prev => prev ?? globalSiteId)
    } else if (sites.length > 0) {
      setLocalSiteId(prev => prev ?? sites[0].id)
    }
  }, [role, userSiteId, globalSiteId, sites])

  useEffect(() => {
    if (!localSiteId) return
    setAllTeams([])
    setSelectedTeamIds([])
    Promise.all([
      supabase.from('teams').select('id, name, cdpf, type, site_id').eq('site_id', localSiteId).order('name'),
      supabase.from('shift_codes').select('id, code, label, site_id, team_id, team_prefix, location_prefix, start_time, end_time, break_minutes, net_hours, paid_hours, color').order('code'),
    ]).then(([tRes, scRes]) => {
      const teams = (tRes.data ?? []) as Team[]
      setAllTeams(teams)
      setSelectedTeamIds(teams.map(t => t.id))
      setShiftCodes(scRes.data ?? [])
    })
  }, [localSiteId])

  const loadBudgetData = useCallback(async () => {
    if (selectedTeamIds.length === 0 || activeTab !== 'synthese') {
      setEmpMap({})
      setScheduleMap({})
      setTeamBudget({})
      return
    }
    setLoadingBudget(true)
    try {
      const startDate = `${year}-${pad(month + 1)}-01`
      const lastDay = new Date(year, month + 1, 0).getDate()
      const endDate = `${year}-${pad(month + 1)}-${pad(lastDay)}`

      const [etRes, schedRes, calRes] = await Promise.all([
        supabase.from('employee_teams')
          .select('employee_id, team_id, employees(id, is_active, start_date, end_date)')
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

      const newEmpMap: Record<string, EmpRow> = {}
      for (const et of (etRes.data ?? []) as any[]) {
        const e = et.employees
        if (!e || !e.is_active) continue
        if (e.start_date && e.start_date > endDate) continue
        if (e.end_date && e.end_date < startDate) continue
        if (!newEmpMap[e.id]) newEmpMap[e.id] = { id: e.id, teamIds: [] }
        if (!newEmpMap[e.id].teamIds.includes(et.team_id)) newEmpMap[e.id].teamIds.push(et.team_id)
      }
      setEmpMap(newEmpMap)

      const newSchedMap: Record<string, Record<string, CellEntry[]>> = {}
      for (const s of (schedRes.data ?? []) as any[]) {
        if (!s.code) continue
        if (!newSchedMap[s.employee_id]) newSchedMap[s.employee_id] = {}
        if (!newSchedMap[s.employee_id][s.date]) newSchedMap[s.employee_id][s.date] = []
        const existing = newSchedMap[s.employee_id][s.date]
        if (!existing.find(c => c.teamId === s.team_id)) existing.push({ teamId: s.team_id, code: s.code })
      }
      setScheduleMap(newSchedMap)

      const structureIds = [...new Set((calRes.data ?? []).map((c: any) => c.structure_id).filter(Boolean))]
      const newBudget: Record<string, number> = {}
      if (structureIds.length && shiftCodes.length) {
        const scHours: Record<string, number> = {}
        for (const sc of shiftCodes) { if (sc.code) scHours[sc.code] = Number(sc.paid_hours ?? 0) }
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
      setLoadingBudget(false)
    }
  }, [selectedTeamIds, month, year, shiftCodes, activeTab])

  useEffect(() => { loadBudgetData() }, [loadBudgetData])

  const days = useMemo(() => {
    const n = new Date(year, month + 1, 0).getDate()
    return Array.from({ length: n }, (_, i) => new Date(year, month, i + 1))
  }, [year, month])

  const selectedTeams = useMemo(() => allTeams.filter(t => selectedTeamIds.includes(t.id)), [allTeams, selectedTeamIds])

  function getPaidHours(code: string): number {
    return Number(shiftCodes.find(c => c.code === code)?.paid_hours ?? 0)
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
    return days.reduce((sum, d) => sum + getTeamDayHours(teamId, `${year}-${pad(month + 1)}-${pad(d.getDate())}`), 0)
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

  async function handleExportSynthese() {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const today = new Date()
    const fileDate = `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`
    const siteName = (sites.find(s => s.id === localSiteId)?.name ?? 'Site').replace(/\s+/g, '_')

    const synRows: any[][] = [['Équipe', 'Nb salariés', 'Heures budget', 'Heures planifiées', 'Écart', 'Écart %']]
    let tBudget = 0, tPlanned = 0
    for (const team of selectedTeams) {
      const budget = teamBudget[team.id] ?? 0
      const planned = getTeamMonthHours(team.id)
      const nb = getTeamActiveEmps(team.id)
      const ecart = planned - budget
      const ecartPct = budget > 0 ? ecart / budget * 100 : null
      tBudget += budget; tPlanned += planned
      synRows.push([teamLabel(team), nb, +budget.toFixed(2), +planned.toFixed(2), +ecart.toFixed(2), ecartPct !== null ? +ecartPct.toFixed(1) : ''])
    }
    const tEcart = tPlanned - tBudget
    synRows.push(['TOTAL SITE', Object.keys(empMap).length, +tBudget.toFixed(2), +tPlanned.toFixed(2), +tEcart.toFixed(2), tBudget > 0 ? +(tEcart / tBudget * 100).toFixed(1) : ''])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(synRows), 'Synthèse budgétaire')
    XLSX.writeFile(wb, `${fileDate}_SyntheseBudgetaire_${siteName}_${MONTHS[month]}_${year}.xlsx`)
  }

  if (role && !canView) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-500">Accès non autorisé.</p>
      </div>
    )
  }

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 flex-wrap">
        <h1 className="text-sm font-bold text-gray-900 mr-1">Contrôle de gestion</h1>

        {role === 'responsable' ? (
          <span className="text-sm font-medium text-slate-700 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
            {sites.find(s => s.id === localSiteId)?.name ?? ''}
          </span>
        ) : (
          <select value={localSiteId ?? ''} onChange={e => setLocalSiteId(e.target.value || null)}
            className="border border-gray-200 rounded-lg px-2 py-0.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-200">
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}

        <select value={month} onChange={e => setMonth(+e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-0.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-200">
          {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>

        <select value={year} onChange={e => setYear(+e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-0.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-200">
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* ── Tabs ── */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-4 flex gap-0">
        <button onClick={() => setActiveTab('compteur')}
          className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${activeTab === 'compteur' ? 'border-slate-900 text-slate-900' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
          Compteur d'heures
        </button>
        <button onClick={() => setActiveTab('synthese')}
          className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${activeTab === 'synthese' ? 'border-slate-900 text-slate-900' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
          Synthèse budgétaire
        </button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'compteur' && (
          <TabCompteur
            key={`${localSiteId}-${year}-${month}`}
            employees={[]}
            schedules={[]}
            absenceCodes={[]}
            shiftCodes={shiftCodes}
            year={year}
            month={month}
            teamId={allTeams[0]?.id ?? ''}
            teamName=""
            teams={allTeams}
          />
        )}

        {activeTab === 'synthese' && (
          <div className="h-full overflow-auto p-6">
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
                    <span className="font-semibold text-slate-800">{teamLabel(team)}</span>
                  </label>
                ))}
                {allTeams.length > 1 && (
                  <button
                    onClick={() => setSelectedTeamIds(selectedTeamIds.length === allTeams.length ? [] : allTeams.map(t => t.id))}
                    className="text-xs text-blue-600 hover:underline ml-1">
                    {selectedTeamIds.length === allTeams.length ? 'Tout décocher' : 'Tout cocher'}
                  </button>
                )}
                <button
                  onClick={handleExportSynthese}
                  disabled={loadingBudget || selectedTeamIds.length === 0}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-40 transition-colors">
                  Exporter Excel
                </button>
              </div>
            )}

            {loadingBudget && <div className="text-sm text-gray-400 mb-4 animate-pulse">Chargement…</div>}

            {!loadingBudget && selectedTeams.length > 0 && (
              <div className="overflow-x-auto">
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
                      <td className="px-3 py-2 text-right border border-slate-700">{Object.keys(empMap).length}</td>
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

            {!loadingBudget && selectedTeamIds.length === 0 && (
              <div className="text-center py-16 text-gray-400 text-sm">Sélectionnez au moins une équipe.</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
