'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { AbsenceCode, CalendarDay, Employee, Schedule, ShiftCode, Team } from './types'
import { teamLabel } from '@/lib/teamUtils'
import TabSaisie from './TabSaisie'
import TabPlanning from './TabPlanning'
import TabCompteur from './TabCompteur'
import TabEmargement from './TabEmargement'
import TabHeuresSup from './TabHeuresSup'
import TabArchives from './TabArchives'
import { useAuth } from '@/lib/auth'

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const TABS = [
  { id: 'saisie',       label: 'Saisie' },
  { id: 'planning',     label: 'Planning imprimable' },
  { id: 'compteur',     label: 'Compteur d\'heures' },
  { id: 'emargement',   label: 'Feuille d\'émargement' },
  { id: 'heures-supp',  label: 'Heures supp.' },
  { id: 'archives',     label: 'Archives' },
] as const
type TabId = typeof TABS[number]['id']

export default function PlanningPage() {
  const now = new Date()
  const { role, allowedTeams, loading: authLoading } = useAuth()
  const [teamId, setTeamId]     = useState<string>('')
  const [month, setMonth]       = useState(now.getMonth())
  const [year, setYear]         = useState(now.getFullYear())
  const [tab, setTab]           = useState<TabId>('saisie')
  const [teams, setTeams]       = useState<Team[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [shiftCodes, setShiftCodes] = useState<ShiftCode[]>([])
  const [absenceCodes, setAbsenceCodes] = useState<AbsenceCode[]>([])
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [isArchived, setIsArchived]   = useState(false)
  const [archiveDate, setArchiveDate] = useState<string | null>(null)

  // Load teams + codes — attend que l'auth soit résolue pour éviter un double-fetch
  useEffect(() => {
    if (authLoading) return
    Promise.all([
      supabase.from('teams').select('id, name, cdpf, type').order('name'),
      supabase.from('shift_codes').select('id, code, label, team_id, team_prefix, location_prefix, start_time, end_time, break_minutes, net_hours, paid_hours').order('code'),
      supabase.from('absence_codes').select('id, code, label, is_paid').order('code'),
    ]).then(([tRes, scRes, acRes]) => {
      let t = tRes.data ?? []
      if (role === 'manager' && allowedTeams.length > 0) {
        t = t.filter((team: any) => allowedTeams.includes(team.id))
      }
      setTeams(t)
      setTeamId(prev => (prev && t.find((x: any) => x.id === prev)) ? prev : (t[0]?.id ?? ''))
      setShiftCodes(scRes.data ?? [])
      setAbsenceCodes(acRes.data ?? [])
    })
  }, [role, allowedTeams, authLoading])

  const loadEmployeesAndSchedules = useCallback(async () => {
    if (!teamId) return
    setLoading(true)
    setError(null)
    // Réinitialiser explicitement avant chaque chargement pour ne pas garder
    // un état périmé entre navigations
    setIsArchived(false)
    setArchiveDate(null)
    try {
      const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
      const lastDay = new Date(year, month + 1, 0).getDate()
      const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`

      const [etRes, schedRes, archRes] = await Promise.all([
        supabase
          .from('employee_teams')
          .select('employee_id, is_primary, employees(id, first_name, last_name, contract_type, weekly_contract_hours, hourly_rate, statut, fonction, is_active)')
          .eq('team_id', teamId),
        supabase
          .from('schedules')
          .select('id, employee_id, team_id, date, code, start_time, end_time, break_minutes, type, status, notes')
          .eq('team_id', teamId)
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('planning_archives')
          .select('archived_at')
          .eq('team_id', teamId)
          .eq('month', month + 1)
          .eq('year', year)
          .maybeSingle(),
      ])

      // Statut d'archivage — appliqué immédiatement, indépendamment des autres erreurs
      setIsArchived(!!archRes.data)
      setArchiveDate(archRes.data?.archived_at ?? null)

      // Fetch calendar days (non-blocking — table may not exist yet)
      try {
        const { data: calData } = await supabase
          .from('annual_calendar')
          .select('date, structure_id, staffing_structures(name)')
          .eq('team_id', teamId)
          .gte('date', startDate)
          .lte('date', endDate)
        setCalendarDays((calData ?? []).map((c: any) => ({
          date: c.date,
          structure_id: c.structure_id ?? null,
          structure_name: c.staffing_structures?.name ?? null,
        })))
      } catch {
        setCalendarDays([])
      }

      if (etRes.error) throw new Error(etRes.error.message)
      if (schedRes.error) throw new Error(schedRes.error.message)

      const empList: Employee[] = []
      const seen = new Set<string>()
      for (const et of (etRes.data ?? []) as any[]) {
        const e = et.employees
        if (!e || !e.is_active || seen.has(e.id)) continue
        seen.add(e.id)
        empList.push({ id: e.id, first_name: e.first_name, last_name: e.last_name, contract_type: e.contract_type, weekly_contract_hours: e.weekly_contract_hours, hourly_rate: e.hourly_rate ?? null, statut: e.statut ?? null, fonction: e.fonction ?? null, is_primary: et.is_primary ?? true })
      }
      // Primary employees first, each group sorted by last name
      empList.sort((a, b) => {
        if ((a.is_primary ?? true) !== (b.is_primary ?? true)) return (b.is_primary ?? true) ? 1 : -1
        return a.last_name.localeCompare(b.last_name)
      })

      setEmployees(empList)
      setSchedules(schedRes.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [teamId, month, year])

  // Fetch on team/month/year change
  useEffect(() => { loadEmployeesAndSchedules() }, [loadEmployeesAndSchedules])

  // Re-fetch when switching BACK to saisie (so TabSaisie remounts with fresh data)
  const prevTabRef = useRef<TabId>(tab)
  useEffect(() => {
    if (tab === 'saisie' && prevTabRef.current !== 'saisie') {
      loadEmployeesAndSchedules()
    }
    prevTabRef.current = tab
  }, [tab, loadEmployeesAndSchedules])

  const currentTeam = teams.find(t => t.id === teamId)
  const currentTeamName = currentTeam ? teamLabel(currentTeam) : ''

  const tabProps = {
    employees,
    schedules,
    shiftCodes,
    absenceCodes,
    year,
    month,
    teamId,
    teamName: currentTeamName,
    teams,
    calendarDays,
    isArchived,
    archiveDate,
    onArchived: () => { setIsArchived(true); loadEmployeesAndSchedules() },
  }

  // The key forces TabSaisie to remount (and reset local state) when team/month/year changes
  const saisieKey = `${teamId}-${year}-${month}`

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 1 + i)

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        <svg className="animate-spin h-5 w-5 mr-2 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Chargement…
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Top bar ── */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 flex-wrap">
        <h1 className="text-lg font-bold text-gray-900 mr-2">Planning</h1>

        {/* Team */}
        <select value={teamId} onChange={e => setTeamId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-200">
          {teams.map(t => <option key={t.id} value={t.id}>{teamLabel(t)}</option>)}
        </select>

        {/* Month */}
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-200">
          {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>

        {/* Year */}
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-200">
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {/* Refresh */}
        <button onClick={loadEmployeesAndSchedules} title="Rafraîchir"
          className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors ml-1">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        <div className="ml-auto text-xs text-gray-400">
          {employees.length} employé{employees.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-6 flex gap-0">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-hidden">
        {error && (
          <div className="p-4">
            <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm">Erreur : {error}</div>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">Chargement…</div>
        ) : employees.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Aucun employé actif pour cette équipe. Vérifiez les affectations dans <strong className="mx-1">Employés</strong>.
          </div>
        ) : (
          <>
            {tab === 'saisie'      && <TabSaisie     key={saisieKey} {...tabProps} />}
            {tab === 'planning'    && <TabPlanning   {...tabProps} />}
            {tab === 'compteur'    && <TabCompteur   {...tabProps} />}
            {tab === 'emargement'  && <TabEmargement {...tabProps} />}
            {tab === 'heures-supp' && <TabHeuresSup  {...tabProps} />}
            {tab === 'archives'    && <TabArchives   {...tabProps} />}
          </>
        )}
      </div>
    </div>
  )
}
