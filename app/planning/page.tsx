'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import type { AbsenceCode, CalendarDay, Employee, EmployeeHistory, Schedule, ShiftCode, Team } from './types'
import { teamLabel } from '@/lib/teamUtils'
import TabSaisie from './TabSaisie'
import TabPlanning from './TabPlanning'
import TabCompteur from './TabCompteur'
import TabEmargement from './TabEmargement'
import TabArchives from './TabArchives'
import TabFeuilleJour from './TabFeuilleJour'
import { useAuth } from '@/lib/auth'
import { useSite } from '@/lib/site-context'
import { usePermissions } from '@/lib/permissions'
import type { Permission } from '@/lib/permissions'
import { loadTeamData, loadEmployeeHistory } from '@/lib/planning-data'

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const TABS = [
  { id: 'saisie',       label: 'Saisie' },
  { id: 'planning',     label: 'Planning imprimable' },
  { id: 'compteur',     label: 'Compteur d\'heures' },
  { id: 'emargement',   label: 'Feuille d\'émargement' },
  { id: 'feuille-jour', label: 'Feuille du jour' },
  { id: 'archives',     label: 'Archives' },
] as const
type TabId = typeof TABS[number]['id']

const TAB_PERMISSIONS: Partial<Record<TabId, Permission>> = {
  saisie:       'edit_planning',
  planning:     'print_planning',
  compteur:     'view_hours_counter',
  emargement:   'print_emargement',
  archives:     'archive_planning',
}

export default function PlanningPage() {
  const now = new Date()
  const { role, allowedTeams, loading: authLoading, user } = useAuth()
  const { selectedSiteId } = useSite()
  const { can } = usePermissions()
  const [teamId, setTeamId]     = useState<string>('')
  const [month, setMonth]       = useState(now.getMonth())
  const [year, setYear]         = useState(now.getFullYear())
  const [tab, setTab]           = useState<TabId>('saisie')
  const [allTeams, setAllTeams]   = useState<Team[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [absenceCodes, setAbsenceCodes] = useState<AbsenceCode[]>([])
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([])
  const [employeeHistory, setEmployeeHistory] = useState<EmployeeHistory[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [isArchived, setIsArchived]   = useState(false)
  const [archiveDate, setArchiveDate] = useState<string | null>(null)
  const [planningStatus, setPlanningStatus] = useState<'brouillon' | 'publie'>('brouillon')
  const [publishLoading, setPublishLoading] = useState(false)

  // Onglets visibles selon permissions
  const visibleTabs = TABS.filter(t => {
    const perm = TAB_PERMISSIONS[t.id]
    return !perm || can(perm)
  })
  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.find(t => t.id === tab)) {
      setTab(visibleTabs[0].id)
    }
  }, [visibleTabs.map(t => t.id).join(',')])

  // Filtre par site + filtre manager, réactifs sans re-fetch
  const teams = useMemo(() => {
    let t = allTeams
    if (selectedSiteId) t = t.filter(team => team.site_id === selectedSiteId)
    if (!authLoading && role === 'manager' && allowedTeams.length > 0) {
      t = t.filter(team => allowedTeams.includes(team.id))
    }
    return t
  }, [allTeams, selectedSiteId, role, allowedTeams, authLoading])

  // Shift codes filtrés par site
  const [shiftCodes, setShiftCodes] = useState<ShiftCode[]>([])
  const [jobFunctions, setJobFunctions] = useState<{ name: string; code: string | null }[]>([])
  const filteredShiftCodes = useMemo(() => {
    if (!selectedSiteId) return shiftCodes
    return shiftCodes.filter(sc => !sc.site_id || sc.site_id === selectedSiteId)
  }, [shiftCodes, selectedSiteId])

  // Charger équipes + codes immédiatement, sans attendre l'auth
  useEffect(() => {
    Promise.all([
      supabase.from('teams').select('id, name, cdpf, type, site_id').order('name'),
      supabase.from('shift_codes').select('id, code, label, site_id, team_id, team_prefix, location_prefix, start_time, end_time, break_minutes, net_hours, paid_hours').order('code'),
      supabase.from('absence_codes').select('id, code, label, is_paid').order('code'),
      supabase.from('job_functions').select('id, name, code').order('name'),
    ]).then(([tRes, scRes, acRes, jfRes]) => {
      setAllTeams(tRes.data ?? [])
      setShiftCodes(scRes.data ?? [])
      setAbsenceCodes(acRes.data ?? [])
      setJobFunctions((jfRes.data ?? []).map((f: any) => ({ name: f.name, code: f.code ?? null })))
    })
  }, [])

  // Ajuster la sélection d'équipe quand la liste filtrée change
  useEffect(() => {
    if (teams.length === 0) return
    setTeamId(prev => (prev && teams.find((x: any) => x.id === prev)) ? prev : (teams[0]?.id ?? ''))
  }, [teams])

  const loadEmployeesAndSchedules = useCallback(async () => {
    if (!teamId) return
    setLoading(true)
    setError(null)
    setIsArchived(false)
    setArchiveDate(null)
    try {
      const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
      const lastDay = new Date(year, month + 1, 0).getDate()
      const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`

      const [planningData, archRes, psRes] = await Promise.all([
        loadTeamData(teamId, month, year),
        supabase
          .from('planning_archives')
          .select('archived_at')
          .eq('team_id', teamId)
          .eq('month', month + 1)
          .eq('year', year)
          .maybeSingle(),
        supabase
          .from('planning_status')
          .select('status')
          .eq('team_id', teamId)
          .eq('month', month + 1)
          .eq('year', year)
          .maybeSingle(),
      ])

      setIsArchived(!!archRes.data)
      setArchiveDate(archRes.data?.archived_at ?? null)
      setPlanningStatus((psRes.data?.status as 'brouillon' | 'publie') ?? 'brouillon')

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

      setEmployees(planningData.employees)
      setSchedules(planningData.schedules)
      loadEmployeeHistory(planningData.employees.map(e => e.id)).then(setEmployeeHistory).catch(() => setEmployeeHistory([]))
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
    shiftCodes: filteredShiftCodes,
    absenceCodes,
    jobFunctions,
    year,
    month,
    teamId,
    teamName: currentTeamName,
    teams,
    calendarDays,
    isArchived,
    archiveDate,
    onArchived: () => { setIsArchived(true); loadEmployeesAndSchedules() },
    onRefresh: loadEmployeesAndSchedules,
    employeeHistory,
  }

  async function handlePublish() {
    if (!confirm(`Publier le planning de ${currentTeamName} pour ${MONTHS[month]} ${year} ? Les salariés pourront le consulter sur leur téléphone.`)) return
    setPublishLoading(true)
    setPlanningStatus('publie') // update optimiste immédiat
    await supabase.from('planning_status').upsert(
      { team_id: teamId, month: month + 1, year, status: 'publie', published_at: new Date().toISOString(), published_by: user?.id ?? null },
      { onConflict: 'team_id,month,year' }
    )
    setPublishLoading(false)
  }

  async function handleUnpublish() {
    if (!confirm(`Repasser en brouillon le planning de ${currentTeamName} pour ${MONTHS[month]} ${year} ?`)) return
    setPublishLoading(true)
    setPlanningStatus('brouillon') // update optimiste immédiat
    await supabase.from('planning_status').upsert(
      { team_id: teamId, month: month + 1, year, status: 'brouillon', published_at: null, published_by: null },
      { onConflict: 'team_id,month,year' }
    )
    setPublishLoading(false)
  }

  // The key forces TabSaisie to remount (and reset local state) when team/month/year changes
  const saisieKey = `${teamId}-${year}-${month}`

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 1 + i)


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

        {/* Badge statut + bouton publication */}
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
          planningStatus === 'publie' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
        }`}>
          {planningStatus === 'publie' ? 'Publié' : 'Brouillon'}
        </span>
        {planningStatus === 'brouillon' && (role === 'admin' || role === 'responsable' || role === 'manager') && (
          <button onClick={handlePublish} disabled={publishLoading}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors">
            {publishLoading ? '…' : 'Publier'}
          </button>
        )}
        {planningStatus === 'publie' && (role === 'admin' || role === 'responsable') && (
          <button onClick={handleUnpublish} disabled={publishLoading}
            className="px-3 py-1.5 text-xs font-semibold border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
            {publishLoading ? '…' : 'Dépublier'}
          </button>
        )}

        <div className="ml-auto text-xs text-gray-400">
          {employees.length} employé{employees.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-6 flex gap-0">
        {visibleTabs.map(t => (
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
          <div className="flex-1 overflow-hidden animate-pulse">
            {/* Barre actions skeleton */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
              <div className="h-6 w-28 bg-gray-200 rounded-lg" />
              <div className="h-6 w-36 bg-gray-200 rounded-lg" />
              <div className="h-6 w-24 ml-auto bg-gray-200 rounded-lg" />
            </div>
            {/* Grille skeleton */}
            <div className="overflow-auto h-full">
              {/* Header */}
              <div className="flex sticky top-0 z-20 border-b border-gray-100 bg-white">
                <div className="w-40 shrink-0 h-9 bg-gray-50 border-r border-gray-100" />
                {Array.from({ length: 31 }, (_, i) => (
                  <div key={i} className={`w-10 shrink-0 h-9 border-r border-gray-100 ${i % 7 >= 5 ? 'bg-gray-100' : 'bg-gray-50'}`} />
                ))}
                {[0,1,2,3,4].map(w => (
                  <div key={w} className="w-14 shrink-0 h-9 bg-indigo-50 border-r border-indigo-100" />
                ))}
                <div className="w-16 shrink-0 h-9 bg-gray-50 border-l border-gray-100" />
              </div>
              {/* Effectifs row */}
              <div className="flex border-b border-gray-100">
                <div className="w-40 shrink-0 h-5 bg-white border-r border-gray-100 px-3">
                  <div className="h-2 bg-gray-200 rounded w-16 mt-1.5" />
                </div>
                {Array.from({ length: 36 }, (_, i) => (
                  <div key={i} className="w-10 shrink-0 h-5 border-r border-gray-100" />
                ))}
                <div className="w-16 shrink-0 h-5 border-l border-gray-100" />
              </div>
              {/* Employee rows */}
              {Array.from({ length: 10 }, (_, row) => (
                <div key={row} className="flex border-b border-gray-100">
                  <div className="w-40 shrink-0 h-6 border-r border-gray-100 bg-white px-3 flex items-center">
                    <div className={`h-2.5 bg-gray-200 rounded ${[28,24,20,26,22,30,18,25,23,27][row]}px`} style={{ width: [112,96,80,104,88,120,72,100,92,108][row] }} />
                  </div>
                  {Array.from({ length: 31 }, (_, col) => (
                    <div key={col} className={`w-10 shrink-0 h-6 border-r border-gray-100 ${col % 7 >= 5 ? 'bg-gray-100' : ''}`} />
                  ))}
                  {[0,1,2,3,4].map(w => (
                    <div key={w} className="w-14 shrink-0 h-6 bg-indigo-50/30 border-r border-indigo-100" />
                  ))}
                  <div className="w-16 shrink-0 h-6 border-l border-gray-100 bg-white" />
                </div>
              ))}
            </div>
          </div>
        ) : employees.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Aucun salarié actif pour cette équipe. Vérifiez les affectations dans <strong className="mx-1">Salariés</strong>.
          </div>
        ) : (
          <>
            {tab === 'saisie'       && <TabSaisie      key={saisieKey} {...tabProps} />}
            {tab === 'planning'     && <TabPlanning    {...tabProps} />}
            {tab === 'compteur'     && <TabCompteur    {...tabProps} />}
            {tab === 'emargement'   && <TabEmargement  {...tabProps} />}
            {tab === 'feuille-jour' && <TabFeuilleJour {...tabProps} />}
            {tab === 'archives'     && <TabArchives    {...tabProps} />}
          </>
        )}
      </div>
    </div>
  )
}
