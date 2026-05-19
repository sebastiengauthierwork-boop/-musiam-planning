'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { TabProps } from './types'
import { teamLabel } from '@/lib/teamUtils'
import { getCodeColor } from '@/lib/utils'

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

type CellEntry = { teamId: string; code: string }
type EmpRow = { id: string; first_name: string; last_name: string; teamIds: string[] }

const COL_NOM = 120
const COL_PRENOM = 90
const COL_EQ = 60

export default function TabConsolidation({ teams = [], shiftCodes, year, month }: TabProps) {
  const days = getDays(year, month)

  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>(teams.map(t => t.id))
  const [empMap, setEmpMap] = useState<Record<string, EmpRow>>({})
  const [scheduleMap, setScheduleMap] = useState<Record<string, Record<string, CellEntry[]>>>({})
  const [loading, setLoading] = useState(false)

  const teamsKey = teams.map(t => t.id).join(',')
  useEffect(() => {
    setSelectedTeamIds(teams.map(t => t.id))
  }, [teamsKey])

  const loadData = useCallback(async () => {
    if (selectedTeamIds.length === 0) {
      setEmpMap({})
      setScheduleMap({})
      return
    }
    setLoading(true)
    try {
      const startDate = `${year}-${pad(month + 1)}-01`
      const lastDay = new Date(year, month + 1, 0).getDate()
      const endDate = `${year}-${pad(month + 1)}-${pad(lastDay)}`

      const [etRes, schedRes] = await Promise.all([
        supabase.from('employee_teams')
          .select('employee_id, team_id, employees(id, first_name, last_name, is_active, start_date, end_date)')
          .in('team_id', selectedTeamIds),
        supabase.from('schedules')
          .select('employee_id, team_id, date, code')
          .in('team_id', selectedTeamIds)
          .gte('date', startDate)
          .lte('date', endDate)
          .not('code', 'is', null)
          .neq('code', ''),
      ])

      const newEmpMap: Record<string, EmpRow> = {}
      for (const et of (etRes.data ?? []) as any[]) {
        const e = et.employees
        if (!e || !e.is_active) continue
        if (e.start_date && e.start_date > endDate) continue
        if (e.end_date && e.end_date < startDate) continue
        if (!newEmpMap[e.id]) newEmpMap[e.id] = { id: e.id, first_name: e.first_name, last_name: e.last_name, teamIds: [] }
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
    } finally {
      setLoading(false)
    }
  }, [selectedTeamIds, month, year])

  useEffect(() => { loadData() }, [loadData])

  const sortedEmployees = useMemo(() => {
    return Object.values(empMap).sort((a, b) => a.last_name.localeCompare(b.last_name))
  }, [empMap])

  const selectedTeams = useMemo(() => teams.filter(t => selectedTeamIds.includes(t.id)), [teams, selectedTeamIds])

  function getTeamShortLabel(teamId: string): string {
    const t = teams.find(x => x.id === teamId) as any
    if (!t) return '?'
    return t.cdpf || t.name.slice(0, 3).toUpperCase()
  }

  function getPaidHours(code: string): number {
    return Number(shiftCodes.find(c => c.code === code)?.paid_hours ?? 0)
  }

  function getCells(empId: string, dateStr: string): CellEntry[] {
    return scheduleMap[empId]?.[dateStr] ?? []
  }

  function isConflict(cells: CellEntry[]): boolean {
    return cells.length > 1 && new Set(cells.map(c => c.teamId)).size > 1
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
    return days.reduce((sum, d) => sum + getTeamDayHours(teamId, `${year}-${pad(month + 1)}-${pad(d.getDate())}`), 0)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Team selector */}
      <div className="shrink-0 px-4 py-2 border-b border-gray-200 bg-white flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-gray-600">Équipes :</span>
        {teams.map(team => (
          <label key={team.id} className="flex items-center gap-1.5 cursor-pointer select-none text-xs">
            <input
              type="checkbox"
              checked={selectedTeamIds.includes(team.id)}
              onChange={() => setSelectedTeamIds(prev =>
                prev.includes(team.id) ? prev.filter(id => id !== team.id) : [...prev, team.id]
              )}
              className="rounded border-gray-300"
            />
            <span className="font-semibold text-slate-700">{getTeamShortLabel(team.id)}</span>
            <span className="text-gray-500">{team.name}</span>
          </label>
        ))}
        {teams.length > 1 && (
          <button
            onClick={() => setSelectedTeamIds(selectedTeamIds.length === teams.length ? [] : teams.map(t => t.id))}
            className="text-xs text-blue-600 hover:underline"
          >
            {selectedTeamIds.length === teams.length ? 'Tout décocher' : 'Tout cocher'}
          </button>
        )}
        {loading && <span className="text-xs text-gray-400 animate-pulse ml-2">Chargement…</span>}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        {selectedTeamIds.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Sélectionnez au moins une équipe.</div>
        ) : !loading && sortedEmployees.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Aucun salarié trouvé.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse" style={{ minWidth: `${COL_NOM + COL_PRENOM + COL_EQ + days.length * 38 + 64}px` }}>
              <thead>
                <tr className="bg-slate-100">
                  <th className="bg-slate-100 border-b border-r border-slate-200 px-2 py-2 text-left font-semibold text-slate-700 whitespace-nowrap" style={{ position: 'sticky', left: 0, zIndex: 20, minWidth: COL_NOM }}>Nom</th>
                  <th className="bg-slate-100 border-b border-r border-slate-200 px-2 py-2 text-left font-semibold text-slate-700 whitespace-nowrap" style={{ position: 'sticky', left: COL_NOM, zIndex: 20, minWidth: COL_PRENOM }}>Prénom</th>
                  <th className="bg-slate-100 border-b border-r border-slate-200 px-2 py-2 text-center font-semibold text-slate-700 whitespace-nowrap" style={{ position: 'sticky', left: COL_NOM + COL_PRENOM, zIndex: 20, minWidth: COL_EQ }}>Éq.</th>
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
                  <th className="bg-slate-100 border-b border-l border-slate-200 px-2 py-2 text-right font-semibold text-slate-700 whitespace-nowrap" style={{ position: 'sticky', right: 0, zIndex: 20, minWidth: 64 }}>Total h</th>
                </tr>
              </thead>
              <tbody>
                {sortedEmployees.map((emp, idx) => {
                  const bg = idx % 2 === 0 ? '#ffffff' : '#f9fafb'
                  const totalH = getEmpTotalHours(emp.id)
                  return (
                    <tr key={emp.id}>
                      <td className="border-b border-r border-slate-100 px-2 py-1.5 font-medium text-slate-900 whitespace-nowrap" style={{ position: 'sticky', left: 0, zIndex: 10, background: bg, minWidth: COL_NOM }}>{emp.last_name}</td>
                      <td className="border-b border-r border-slate-100 px-2 py-1.5 text-slate-700 whitespace-nowrap" style={{ position: 'sticky', left: COL_NOM, zIndex: 10, background: bg, minWidth: COL_PRENOM }}>{emp.first_name}</td>
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
                              <div className="rounded font-bold leading-tight px-0.5 py-0.5" style={{ fontSize: 9, background: '#ef4444', color: '#fff' }}
                                title={cells.map(c => `${getTeamShortLabel(c.teamId)}=${c.code}`).join(', ')}>
                                {cells.map(c => c.code).join('/')}
                              </div>
                            </td>
                          )
                        }
                        const code = cells[0]?.code ?? ''
                        if (!code) return <td key={d.getDate()} className="border-b border-r border-slate-100" style={{ background: isWe ? '#f1f5f9' : bg, minWidth: 38 }} />
                        const { bg: codeBg, text: codeText } = getCodeColor(code, shiftCodes as any, [])
                        return (
                          <td key={d.getDate()} className="border-b border-r border-slate-100 px-0.5 py-0.5 text-center" style={{ background: bg }}>
                            <div className="rounded font-semibold leading-tight px-0.5 py-0.5" style={{ fontSize: 10, background: codeBg, color: codeText }}>{code}</div>
                          </td>
                        )
                      })}
                      <td className="border-b border-l border-slate-100 px-2 py-1.5 text-right font-mono text-slate-700" style={{ position: 'sticky', right: 0, zIndex: 10, background: bg }}>
                        {fmtH(totalH)}
                      </td>
                    </tr>
                  )
                })}

                {selectedTeams.map(team => {
                  const teamMonthH = getTeamMonthHours(team.id)
                  return (
                    <tr key={`tot-${team.id}`} className="font-semibold">
                      <td className="border-t-2 border-b border-r border-slate-300 px-2 py-1.5 text-slate-700 text-xs whitespace-nowrap" style={{ position: 'sticky', left: 0, zIndex: 10, background: '#f1f5f9', minWidth: COL_NOM }}>Éq. {getTeamShortLabel(team.id)}</td>
                      <td className="border-t-2 border-b border-r border-slate-300 px-2 py-1.5 text-slate-500 text-xs whitespace-nowrap" style={{ position: 'sticky', left: COL_NOM, zIndex: 10, background: '#f1f5f9', minWidth: COL_PRENOM }}>{team.name}</td>
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

                {selectedTeams.length > 1 && (() => {
                  const grandTotal = selectedTeams.reduce((s, t) => s + getTeamMonthHours(t.id), 0)
                  return (
                    <tr className="font-bold text-white">
                      <td className="border-t border-slate-700 px-2 py-2 whitespace-nowrap text-xs" style={{ position: 'sticky', left: 0, zIndex: 10, background: '#1e293b', minWidth: COL_NOM }}>TOTAL GÉNÉRAL</td>
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
      </div>
    </div>
  )
}
