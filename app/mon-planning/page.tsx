'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { getCodeColors } from '@/lib/codeColors'

interface Employee { id: string; first_name: string; last_name: string }
interface Team { id: string; name: string; cdpf: string | null }
interface Schedule { employee_id: string; date: string; code: string; start_time: string | null; end_time: string | null }
interface ShiftCode { id: string; code: string; label: string; start_time: string | null; end_time: string | null }
interface AbsenceCode { id: string; code: string; label: string }

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const DAYS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']

function pad(n: number) { return String(n).padStart(2, '0') }
function dateStr(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}` }

export default function MonPlanningPage() {
  const { user, role, loading: authLoading, signOut } = useAuth()

  const now = new Date()
  const todayKey = dateStr(now.getFullYear(), now.getMonth(), now.getDate())

  // 0 = mois courant, 1 = mois suivant
  const [offset, setOffset] = useState(0)
  const monthDate = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()

  const [tab, setTab] = useState<'planning' | 'equipe'>('planning')

  // Data
  const [employeeId, setEmployeeId] = useState<string | null>(null)
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [team, setTeam] = useState<Team | null>(null)
  const [shiftCodes, setShiftCodes] = useState<ShiftCode[]>([])
  const [absenceCodes, setAbsenceCodes] = useState<AbsenceCode[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [teamEmployees, setTeamEmployees] = useState<Employee[]>([])
  const [teamSchedules, setTeamSchedules] = useState<{ employee_id: string; date: string; code: string }[]>([])

  const [loadingStatic, setLoadingStatic] = useState(true)
  const [loadingSched, setLoadingSched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Enregistrement du service worker (PWA)
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  // Étape 1 : récupérer employee_id depuis users
  useEffect(() => {
    if (!user?.id) return
    supabase.from('users')
      .select('employee_id')
      .eq('id', user.id)
      .single()
      .then(({ data }: { data: any }) => setEmployeeId(data?.employee_id ?? null))
  }, [user?.id])

  // Étape 2 : charger les données statiques (employé, équipe, codes)
  useEffect(() => {
    if (!employeeId) return
    setLoadingStatic(true)

    Promise.all([
      supabase.from('employees').select('id, first_name, last_name').eq('id', employeeId).single(),
      supabase.from('employee_teams')
        .select('team_id, teams(id, name, cdpf)')
        .eq('employee_id', employeeId)
        .eq('is_primary', true)
        .maybeSingle(),
      supabase.from('shift_codes').select('id, code, label, start_time, end_time').order('code'),
      supabase.from('absence_codes').select('id, code, label').order('code'),
    ]).then(([empRes, teamRes, scRes, acRes]) => {
      setEmployee(empRes.data ?? null)
      setTeam((teamRes.data as any)?.teams ?? null)
      setShiftCodes(scRes.data ?? [])
      setAbsenceCodes(acRes.data ?? [])
      setLoadingStatic(false)
    }).catch(e => {
      setError(e.message)
      setLoadingStatic(false)
    })
  }, [employeeId])

  // Étape 3 : charger les plannings (réactif sur mois + équipe)
  const teamId = (team as any)?.id ?? null

  const loadSchedules = useCallback(async () => {
    if (!employeeId || !teamId) return
    setLoadingSched(true)

    const start = `${year}-${pad(month + 1)}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const end = `${year}-${pad(month + 1)}-${lastDay}`

    const [myRes, etRes, tschedRes] = await Promise.all([
      supabase.from('schedules')
        .select('employee_id, date, code, start_time, end_time')
        .eq('employee_id', employeeId)
        .eq('team_id', teamId)
        .gte('date', start).lte('date', end),
      supabase.from('employee_teams')
        .select('employee_id, employees(id, first_name, last_name)')
        .eq('team_id', teamId),
      supabase.from('schedules')
        .select('employee_id, date, code')
        .eq('team_id', teamId)
        .gte('date', start).lte('date', end)
        .limit(5000),
    ])

    setSchedules(myRes.data ?? [])

    const emps: Employee[] = []
    const seen = new Set<string>()
    for (const et of (etRes.data ?? []) as any[]) {
      const e = et.employees
      if (e && !seen.has(e.id)) { seen.add(e.id); emps.push(e) }
    }
    emps.sort((a, b) => a.last_name.localeCompare(b.last_name))
    setTeamEmployees(emps)
    setTeamSchedules(tschedRes.data ?? [])
    setLoadingSched(false)
  }, [employeeId, teamId, year, month])

  useEffect(() => { loadSchedules() }, [loadSchedules])

  // --- Guards ---

  if (authLoading || loadingStatic) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-gray-400 text-base">Chargement…</p>
      </div>
    )
  }

  if (role !== 'salarie') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 px-6">
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-900">Accès réservé aux salariés</p>
          <button
            onClick={signOut}
            className="mt-6 w-full py-3.5 bg-slate-900 text-white rounded-2xl text-base font-semibold"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    )
  }

  if (!employeeId || !employee) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 px-6">
        <div className="text-center">
          <p className="text-base font-semibold text-gray-800">Compte non lié à un salarié</p>
          <p className="text-sm text-gray-400 mt-1">Contactez votre administrateur.</p>
          <button
            onClick={signOut}
            className="mt-6 w-full py-3.5 bg-slate-900 text-white rounded-2xl text-base font-semibold"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 px-6">
        <div className="text-center">
          <p className="text-base text-red-600 font-medium">Erreur : {error}</p>
          <button onClick={() => window.location.reload()} className="mt-4 px-6 py-3 bg-slate-900 text-white rounded-2xl text-base">
            Réessayer
          </button>
        </div>
      </div>
    )
  }

  // --- Données pour le rendu ---

  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month, i + 1)
    const ds = dateStr(year, month, i + 1)
    const sched = schedules.find(s => s.date === ds)
    const code = sched?.code ?? null
    const colors = code ? getCodeColors(code, shiftCodes, absenceCodes) : null
    const sc = code ? shiftCodes.find(c => c.code === code) : null
    return { d, ds, code, colors, sc, isToday: ds === todayKey, isWE: d.getDay() === 0 || d.getDay() === 6 }
  })

  const dates = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month, i + 1)
    return { ds: dateStr(year, month, i + 1), day: i + 1, dow: d.getDay() }
  })

  const schedMap: Record<string, Record<string, string>> = {}
  for (const s of teamSchedules) {
    if (!schedMap[s.employee_id]) schedMap[s.employee_id] = {}
    schedMap[s.employee_id][s.date] = s.code
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ maxWidth: 600, margin: '0 auto' }}>
      {/* Header */}
      <div className="bg-slate-900 text-white px-5 pt-safe pb-5" style={{ paddingTop: 'max(env(safe-area-inset-top), 20px)' }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">Musiam</div>
            <div className="text-2xl font-bold">{employee.first_name} {employee.last_name}</div>
            {team && (
              <div className="text-sm text-slate-300 mt-0.5">
                {team.name}{team.cdpf ? ` · ${team.cdpf}` : ''}
              </div>
            )}
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 text-slate-400 text-sm py-2.5 px-3 rounded-xl active:bg-slate-700 active:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Quitter
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 flex sticky top-0 z-20">
        {(['planning', 'equipe'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-4 text-base font-semibold border-b-2 transition-colors ${
              tab === t ? 'border-slate-900 text-slate-900' : 'border-transparent text-gray-400'
            }`}
          >
            {t === 'planning' ? 'Mon planning' : 'Mon équipe'}
          </button>
        ))}
      </div>

      {/* Sélecteur de mois */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setOffset(0)}
          disabled={offset === 0}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 disabled:opacity-25 active:bg-gray-100"
        >
          ← Actuel
        </button>
        <span className="text-base font-bold text-gray-900">
          {MONTHS[month]} {year}
          {loadingSched && <span className="ml-2 text-xs text-gray-400 font-normal">…</span>}
        </span>
        <button
          onClick={() => setOffset(1)}
          disabled={offset === 1}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 disabled:opacity-25 active:bg-gray-100"
        >
          Suivant →
        </button>
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Onglet Mon planning ── */}
        {tab === 'planning' && (
          <div className="p-4 space-y-2 pb-10">
            {days.map(({ d, ds, code, colors, sc, isToday, isWE }) => (
              <div
                key={ds}
                className={`rounded-2xl border bg-white flex items-center gap-4 px-4 py-3.5 ${
                  isToday ? 'border-slate-900 shadow-sm' : 'border-gray-100'
                }`}
              >
                {/* Jour */}
                <div className="min-w-[52px] flex-shrink-0 text-center">
                  <div className={`text-xs font-bold uppercase tracking-wide ${isWE ? 'text-rose-400' : 'text-gray-400'}`}>
                    {DAYS[d.getDay()].slice(0, 3)}
                  </div>
                  <div className={`text-3xl font-bold leading-none mt-0.5 ${isToday ? 'text-slate-900' : 'text-gray-800'}`}>
                    {d.getDate()}
                  </div>
                </div>

                {/* Séparateur */}
                <div className="w-px self-stretch bg-gray-100 flex-shrink-0" />

                {/* Code + horaires */}
                <div className="flex-1 flex items-center gap-3 min-w-0">
                  {code ? (
                    <>
                      <span
                        className="flex-shrink-0 px-3 py-1.5 rounded-xl text-base font-bold"
                        style={{ background: colors?.bg, color: colors?.text }}
                      >
                        {code}
                      </span>
                      {sc?.start_time && (
                        <span className="text-sm text-gray-500 font-medium">
                          {sc.start_time.slice(0, 5)}&nbsp;–&nbsp;{(sc as any).end_time?.slice(0, 5)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-300 text-sm italic">Non planifié</span>
                  )}
                </div>

                {isToday && (
                  <span className="flex-shrink-0 text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-full">
                    Auj.
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Onglet Mon équipe ── */}
        {tab === 'equipe' && (
          <div className="overflow-x-auto pb-10">
            <table className="border-collapse" style={{ fontSize: 11 }}>
              <thead>
                <tr className="border-b border-gray-100 bg-white sticky top-0 z-10">
                  <th className="sticky left-0 bg-white z-20 px-4 py-3 text-left text-xs font-semibold text-gray-500 min-w-[130px] whitespace-nowrap border-r border-gray-100">
                    Salarié
                  </th>
                  {dates.map(({ ds, day, dow }) => (
                    <th
                      key={ds}
                      className={`w-8 px-0.5 py-3 text-center font-semibold ${
                        ds === todayKey ? 'text-slate-900' : dow === 0 || dow === 6 ? 'text-rose-400' : 'text-gray-400'
                      }`}
                    >
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {teamEmployees.map(emp => {
                  const isMe = emp.id === employeeId
                  return (
                    <tr key={emp.id}>
                      <td
                        className={`sticky left-0 z-10 px-4 py-2 whitespace-nowrap border-r border-gray-100 text-xs font-semibold ${
                          isMe ? 'bg-blue-50 text-blue-700' : 'bg-white text-gray-700'
                        }`}
                      >
                        {isMe ? '▶ ' : ''}{emp.last_name} {emp.first_name.charAt(0)}.
                      </td>
                      {dates.map(({ ds }) => {
                        const code = schedMap[emp.id]?.[ds] ?? ''
                        const colors = code ? getCodeColors(code, shiftCodes, absenceCodes) : null
                        return (
                          <td key={ds} className={`px-0.5 py-1 ${isMe ? 'bg-blue-50/40' : ''}`}>
                            {code ? (
                              <span
                                className="flex items-center justify-center w-7 h-7 rounded-md font-bold"
                                style={{ fontSize: 10, background: colors?.bg, color: colors?.text }}
                              >
                                {code.slice(0, 3)}
                              </span>
                            ) : (
                              <span className="block w-7 h-7" />
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
                {teamEmployees.length === 0 && (
                  <tr>
                    <td colSpan={dates.length + 1} className="px-4 py-8 text-center text-gray-400 text-sm">
                      Aucun membre d'équipe trouvé.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
