'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { useSite } from '@/lib/site-context'
import { isAdmin } from '@/lib/utils'
import { teamLabel } from '@/lib/teamUtils'
import TabCompteur from '@/app/planning/TabCompteur'
import TeamDropdown from '@/components/TeamDropdown'
import type { ShiftCode } from '@/app/planning/types'

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

function pad(n: number) { return String(n).padStart(2, '0') }
function fmtH(h: number): string { return (Math.round(h * 100) / 100).toFixed(2) }

type Team = { id: string; name: string; cdpf: string | null; site_id: string | null; type: string }
type CellEntry = { teamId: string; code: string }

function ecartTextClass(planned: number, budget: number): string {
  if (budget === 0) return 'text-gray-400'
  const pct = (planned - budget) / budget * 100
  if (pct <= 0) return 'text-green-600'
  if (pct <= 5) return 'text-orange-500'
  return 'text-red-600'
}
function ecartLightClass(planned: number, budget: number): string {
  if (budget === 0) return 'text-gray-400'
  const pct = (planned - budget) / budget * 100
  if (pct <= 0) return 'text-green-300'
  if (pct <= 5) return 'text-orange-300'
  return 'text-red-300'
}
function ecartBgClass(planned: number, budget: number): string {
  if (budget === 0) return ''
  const pct = (planned - budget) / budget * 100
  if (pct <= 0) return 'bg-green-50'
  if (pct <= 5) return 'bg-orange-50'
  return 'bg-red-50'
}

export default function ControleDeGestionPage() {
  const now = new Date()
  const { role, allowedSiteId: userSiteId } = useAuth()
  const { sites, selectedSiteId: globalSiteId } = useSite()

  const [localSiteId, setLocalSiteId] = useState<string | null>(null)
  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear] = useState(now.getFullYear())
  const [activeTab, setActiveTab] = useState<'compteur' | 'consolidation'>('compteur')

  const [allTeams, setAllTeams] = useState<Team[]>([])
  const [shiftCodes, setShiftCodes] = useState<ShiftCode[]>([])
  const [compteurTeamId, setCompteurTeamId] = useState<string>('')

  // Consolidation state
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
  const [scheduleMap, setScheduleMap] = useState<Record<string, Record<string, CellEntry[]>>>({})
  const [teamDayBudget, setTeamDayBudget] = useState<Record<string, Record<string, number>>>({})
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
    setCompteurTeamId('')
    Promise.all([
      supabase.from('teams').select('id, name, cdpf, type, site_id').eq('site_id', localSiteId).order('name'),
      supabase.from('shift_codes').select('id, code, label, site_id, team_id, team_prefix, location_prefix, start_time, end_time, break_minutes, net_hours, paid_hours, color').order('code'),
    ]).then(([tRes, scRes]) => {
      const teams = (tRes.data ?? []) as Team[]
      setAllTeams(teams)
      setSelectedTeamIds(teams.map(t => t.id))
      if (teams.length > 0) setCompteurTeamId(teams[0].id)
      setShiftCodes(scRes.data ?? [])
    })
  }, [localSiteId])

  const loadBudgetData = useCallback(async () => {
    if (selectedTeamIds.length === 0 || activeTab !== 'consolidation') {
      setScheduleMap({})
      setTeamDayBudget({})
      return
    }
    setLoadingBudget(true)
    try {
      const startDate = `${year}-${pad(month + 1)}-01`
      const lastDay = new Date(year, month + 1, 0).getDate()
      const endDate = `${year}-${pad(month + 1)}-${pad(lastDay)}`

      const [schedRes, calRes] = await Promise.all([
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
      const newDayBudget: Record<string, Record<string, number>> = {}
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
          if (!newDayBudget[c.team_id]) newDayBudget[c.team_id] = {}
          newDayBudget[c.team_id][c.date] = (newDayBudget[c.team_id][c.date] ?? 0) + (structHours[c.structure_id] ?? 0)
        }
      }
      setTeamDayBudget(newDayBudget)
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
  const compteurTeam = useMemo(() => allTeams.find(t => t.id === compteurTeamId), [allTeams, compteurTeamId])

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

  function getTeamMonthBudget(teamId: string): number {
    return Object.values(teamDayBudget[teamId] ?? {}).reduce((s, h) => s + h, 0)
  }

  function getDayTotalPlanned(dateStr: string): number {
    return selectedTeams.reduce((s, t) => s + getTeamDayHours(t.id, dateStr), 0)
  }

  function getDayTotalBudget(dateStr: string): number {
    return selectedTeams.reduce((s, t) => s + (teamDayBudget[t.id]?.[dateStr] ?? 0), 0)
  }

  const totalMonthPlanned = selectedTeams.reduce((s, t) => s + getTeamMonthHours(t.id), 0)
  const totalMonthBudget = selectedTeams.reduce((s, t) => s + getTeamMonthBudget(t.id), 0)

  async function handleExportConsolidation() {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const today = new Date()
    const fileDate = `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`
    const siteName = (sites.find(s => s.id === localSiteId)?.name ?? 'Site').replace(/\s+/g, '_')

    // Feuille 1 : tableau croisé équipes × jours
    const header1 = ['Équipe', ...days.map(d => d.getDate()), 'Total']
    const rows1: any[][] = [header1]
    for (const team of selectedTeams) {
      const row: any[] = [teamLabel(team)]
      days.forEach(d => {
        const ds = `${year}-${pad(month + 1)}-${pad(d.getDate())}`
        const h = getTeamDayHours(team.id, ds)
        row.push(h > 0 ? parseFloat(h.toFixed(2)) : '')
      })
      row.push(parseFloat(getTeamMonthHours(team.id).toFixed(2)))
      rows1.push(row)
    }
    const totPlanRow: any[] = ['Total planifié']
    days.forEach(d => {
      const ds = `${year}-${pad(month + 1)}-${pad(d.getDate())}`
      const h = getDayTotalPlanned(ds)
      totPlanRow.push(h > 0 ? parseFloat(h.toFixed(2)) : '')
    })
    totPlanRow.push(parseFloat(totalMonthPlanned.toFixed(2)))
    rows1.push(totPlanRow)
    const budgetRow: any[] = ['Budget structure']
    days.forEach(d => {
      const ds = `${year}-${pad(month + 1)}-${pad(d.getDate())}`
      const b = getDayTotalBudget(ds)
      budgetRow.push(b > 0 ? parseFloat(b.toFixed(2)) : '')
    })
    budgetRow.push(parseFloat(totalMonthBudget.toFixed(2)))
    rows1.push(budgetRow)
    const ecartRow: any[] = ['Écart']
    days.forEach(d => {
      const ds = `${year}-${pad(month + 1)}-${pad(d.getDate())}`
      const e = getDayTotalPlanned(ds) - getDayTotalBudget(ds)
      ecartRow.push(e !== 0 ? parseFloat(e.toFixed(2)) : 0)
    })
    ecartRow.push(parseFloat((totalMonthPlanned - totalMonthBudget).toFixed(2)))
    rows1.push(ecartRow)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows1), 'Consolidation')

    // Feuille 2 : récapitulatif mensuel
    const rows2: any[][] = [['Équipe', 'Budget (h)', 'Planifié (h)', 'Écart', 'Écart %']]
    for (const team of selectedTeams) {
      const budget = getTeamMonthBudget(team.id)
      const planned = getTeamMonthHours(team.id)
      const ecart = planned - budget
      const ecartPct = budget > 0 ? ecart / budget * 100 : null
      rows2.push([teamLabel(team), parseFloat(budget.toFixed(2)), parseFloat(planned.toFixed(2)), parseFloat(ecart.toFixed(2)), ecartPct !== null ? parseFloat(ecartPct.toFixed(1)) : ''])
    }
    const tEcart = totalMonthPlanned - totalMonthBudget
    rows2.push(['TOTAL SITE', parseFloat(totalMonthBudget.toFixed(2)), parseFloat(totalMonthPlanned.toFixed(2)), parseFloat(tEcart.toFixed(2)), totalMonthBudget > 0 ? parseFloat((tEcart / totalMonthBudget * 100).toFixed(1)) : ''])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows2), 'Récapitulatif')

    XLSX.writeFile(wb, `${fileDate}_Consolidation_${siteName}_${MONTHS[month]}_${year}.xlsx`)
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

        {activeTab === 'compteur' && allTeams.length > 0 && (
          <select
            value={compteurTeamId}
            onChange={e => setCompteurTeamId(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-0.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-200">
            {allTeams.map(t => <option key={t.id} value={t.id}>{teamLabel(t)}</option>)}
          </select>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-4 flex gap-0">
        <button onClick={() => setActiveTab('compteur')}
          className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${activeTab === 'compteur' ? 'border-slate-900 text-slate-900' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
          Compteur d'heures
        </button>
        <button onClick={() => setActiveTab('consolidation')}
          className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${activeTab === 'consolidation' ? 'border-slate-900 text-slate-900' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
          Consolidation
        </button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'compteur' && (
          <TabCompteur
            key={`${localSiteId}-${year}-${month}-${compteurTeamId}`}
            employees={[]}
            schedules={[]}
            absenceCodes={[]}
            shiftCodes={shiftCodes}
            year={year}
            month={month}
            teamId={compteurTeamId}
            teamName=""
            teams={compteurTeam ? [compteurTeam] : []}
          />
        )}

        {activeTab === 'consolidation' && (
          <div className="h-full flex flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="shrink-0 px-4 py-2 border-b border-gray-200 bg-white flex items-center gap-3 flex-wrap">
              <TeamDropdown
                teams={allTeams}
                selectedIds={selectedTeamIds}
                onChange={setSelectedTeamIds}
              />
              <button
                onClick={handleExportConsolidation}
                disabled={loadingBudget || selectedTeamIds.length === 0}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-40 transition-colors">
                Exporter Excel
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-6">
              {loadingBudget && (
                <div className="text-sm text-gray-400 animate-pulse">Chargement…</div>
              )}

              {!loadingBudget && selectedTeams.length === 0 && (
                <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
                  Sélectionnez au moins une équipe.
                </div>
              )}

              {!loadingBudget && selectedTeams.length > 0 && (
                <>
                  {/* Tableau croisé */}
                  <div className="overflow-x-auto">
                    <table className="text-xs border-collapse w-max">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="px-3 py-2 text-left font-semibold text-slate-700 border border-slate-200 min-w-[140px] sticky left-0 z-10 bg-slate-100 whitespace-nowrap">
                            Équipe
                          </th>
                          {days.map(d => {
                            const dow = d.getDay()
                            const isWe = dow === 0 || dow === 6
                            return (
                              <th key={d.getDate()}
                                className={`px-0 py-2 text-center font-semibold text-slate-700 border border-slate-200 min-w-[36px] ${isWe ? 'bg-slate-200 text-slate-500' : 'bg-slate-100'}`}>
                                {d.getDate()}
                              </th>
                            )
                          })}
                          <th className="px-3 py-2 text-right font-semibold text-slate-700 border border-slate-200 min-w-[60px] bg-slate-100">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedTeams.map((team, idx) => {
                          const monthH = getTeamMonthHours(team.id)
                          const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                          return (
                            <tr key={team.id}>
                              <td className={`px-3 py-1.5 font-medium border border-slate-200 sticky left-0 z-10 whitespace-nowrap ${rowBg}`}>
                                {teamLabel(team)}
                              </td>
                              {days.map(d => {
                                const ds = `${year}-${pad(month + 1)}-${pad(d.getDate())}`
                                const h = getTeamDayHours(team.id, ds)
                                const dow = d.getDay()
                                const isWe = dow === 0 || dow === 6
                                return (
                                  <td key={d.getDate()}
                                    className={`px-0 py-1.5 text-center font-mono border border-slate-200 ${isWe ? 'text-slate-400 bg-slate-50' : 'text-slate-700'}`}>
                                    {h > 0 ? h.toFixed(1) : ''}
                                  </td>
                                )
                              })}
                              <td className="px-3 py-1.5 text-right font-mono font-semibold border border-slate-200 text-slate-700">
                                {monthH > 0 ? fmtH(monthH) : '—'}
                              </td>
                            </tr>
                          )
                        })}

                        {/* Ligne Total planifié */}
                        <tr className="border-t-2 border-slate-300">
                          <td className="px-3 py-1.5 font-semibold text-slate-700 border border-slate-300 sticky left-0 z-10 bg-slate-50 whitespace-nowrap">
                            Total planifié
                          </td>
                          {days.map(d => {
                            const ds = `${year}-${pad(month + 1)}-${pad(d.getDate())}`
                            const h = getDayTotalPlanned(ds)
                            return (
                              <td key={d.getDate()} className="px-0 py-1.5 text-center font-mono font-semibold border border-slate-300 bg-slate-50 text-slate-700">
                                {h > 0 ? h.toFixed(1) : ''}
                              </td>
                            )
                          })}
                          <td className="px-3 py-1.5 text-right font-mono font-semibold border border-slate-300 bg-slate-50 text-slate-700">
                            {totalMonthPlanned > 0 ? fmtH(totalMonthPlanned) : '—'}
                          </td>
                        </tr>

                        {/* Ligne Budget structure */}
                        <tr>
                          <td className="px-3 py-1.5 text-slate-500 border border-slate-300 sticky left-0 z-10 bg-slate-50 whitespace-nowrap">
                            Budget structure
                          </td>
                          {days.map(d => {
                            const ds = `${year}-${pad(month + 1)}-${pad(d.getDate())}`
                            const b = getDayTotalBudget(ds)
                            return (
                              <td key={d.getDate()} className="px-0 py-1.5 text-center font-mono border border-slate-300 bg-slate-50 text-slate-400">
                                {b > 0 ? b.toFixed(1) : ''}
                              </td>
                            )
                          })}
                          <td className="px-3 py-1.5 text-right font-mono border border-slate-300 bg-slate-50 text-slate-400">
                            {totalMonthBudget > 0 ? fmtH(totalMonthBudget) : '—'}
                          </td>
                        </tr>

                        {/* Ligne Écart */}
                        <tr>
                          <td className="px-3 py-1.5 font-medium text-slate-600 border border-slate-300 sticky left-0 z-10 bg-slate-50 whitespace-nowrap">
                            Écart
                          </td>
                          {days.map(d => {
                            const ds = `${year}-${pad(month + 1)}-${pad(d.getDate())}`
                            const planned = getDayTotalPlanned(ds)
                            const budget = getDayTotalBudget(ds)
                            const ecart = planned - budget
                            return (
                              <td key={d.getDate()}
                                className={`px-0 py-1.5 text-center font-mono font-semibold border border-slate-300 ${ecartTextClass(planned, budget)} ${ecartBgClass(planned, budget)}`}>
                                {budget > 0 ? (ecart > 0 ? '+' : '') + ecart.toFixed(1) : ''}
                              </td>
                            )
                          })}
                          {(() => {
                            const ecart = totalMonthPlanned - totalMonthBudget
                            return (
                              <td className={`px-3 py-1.5 text-right font-mono font-semibold border border-slate-300 ${ecartTextClass(totalMonthPlanned, totalMonthBudget)} ${ecartBgClass(totalMonthPlanned, totalMonthBudget)}`}>
                                {totalMonthBudget > 0 ? (ecart > 0 ? '+' : '') + fmtH(ecart) : '—'}
                              </td>
                            )
                          })()}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Bloc récapitulatif */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                      <span className="inline-block h-px flex-1 bg-slate-200" />
                      Récapitulatif mensuel
                      <span className="inline-block h-px flex-1 bg-slate-200" />
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="text-sm border-collapse w-full max-w-2xl">
                        <thead>
                          <tr className="bg-slate-100">
                            {['Équipe', 'Budget (h)', 'Planifié (h)', 'Écart', 'Écart %'].map((h, i) => (
                              <th key={h} className={`px-3 py-2 font-semibold text-slate-700 border border-slate-200 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedTeams.map(team => {
                            const budget = getTeamMonthBudget(team.id)
                            const planned = getTeamMonthHours(team.id)
                            const ecart = planned - budget
                            const ecartPct = budget > 0 ? ecart / budget * 100 : null
                            const cls = ecartTextClass(planned, budget)
                            return (
                              <tr key={team.id} className="hover:bg-slate-50 border-b border-slate-100">
                                <td className="px-3 py-2 font-medium border border-slate-200">{teamLabel(team)}</td>
                                <td className="px-3 py-2 text-right font-mono border border-slate-200">{budget > 0 ? fmtH(budget) : '—'}</td>
                                <td className="px-3 py-2 text-right font-mono border border-slate-200">{planned > 0 ? fmtH(planned) : '—'}</td>
                                <td className={`px-3 py-2 text-right font-mono font-medium border border-slate-200 ${cls}`}>
                                  {budget > 0 ? (ecart > 0 ? '+' : '') + fmtH(ecart) : '—'}
                                </td>
                                <td className={`px-3 py-2 text-right font-medium border border-slate-200 ${cls}`}>
                                  {ecartPct !== null ? (ecartPct > 0 ? '+' : '') + ecartPct.toFixed(1) + '%' : '—'}
                                </td>
                              </tr>
                            )
                          })}
                          <tr className="bg-slate-900 text-white font-semibold">
                            <td className="px-3 py-2 border border-slate-700">TOTAL SITE</td>
                            <td className="px-3 py-2 text-right font-mono border border-slate-700">{totalMonthBudget > 0 ? fmtH(totalMonthBudget) : '—'}</td>
                            <td className="px-3 py-2 text-right font-mono border border-slate-700">{totalMonthPlanned > 0 ? fmtH(totalMonthPlanned) : '—'}</td>
                            {(() => {
                              const ecart = totalMonthPlanned - totalMonthBudget
                              const lightCls = ecartLightClass(totalMonthPlanned, totalMonthBudget)
                              const ecartPct = totalMonthBudget > 0 ? ecart / totalMonthBudget * 100 : null
                              return (
                                <>
                                  <td className={`px-3 py-2 text-right font-mono border border-slate-700 ${lightCls}`}>
                                    {totalMonthBudget > 0 ? (ecart > 0 ? '+' : '') + fmtH(ecart) : '—'}
                                  </td>
                                  <td className={`px-3 py-2 text-right border border-slate-700 ${lightCls}`}>
                                    {ecartPct !== null ? (ecartPct > 0 ? '+' : '') + ecartPct.toFixed(1) + '%' : '—'}
                                  </td>
                                </>
                              )
                            })()}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
