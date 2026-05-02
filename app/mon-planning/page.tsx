'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, Fragment } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { getCodeColors } from '@/lib/codeColors'
import { sortEmployees, isTemporaire } from '@/lib/employeeUtils'

interface Employee { id: string; first_name: string; last_name: string; contract_type: string | null; statut: string | null }
interface Team { id: string; name: string; cdpf: string | null }
interface Schedule { employee_id: string; date: string; code: string; start_time: string | null; end_time: string | null }
interface ShiftCode { id: string; code: string; label: string; start_time: string | null; end_time: string | null }
interface AbsenceCode { id: string; code: string; label: string }

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const DAYS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']

function pad(n: number) { return String(n).padStart(2, '0') }
function dateStr(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}` }

function PasswordModal({ onClose }: { onClose: () => void }) {
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (newPwd.length < 6) { setError('Le nouveau mot de passe doit faire au moins 6 caractères.'); return }
    if (newPwd !== confirmPwd) { setError('Les mots de passe ne correspondent pas.'); return }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email ?? '',
        password: oldPwd,
      })
      if (signInError) { setError('Ancien mot de passe incorrect.'); return }
      const { error: updateError } = await supabase.auth.updateUser({ password: newPwd })
      if (updateError) throw updateError
      setSuccess(true)
    } catch (err: any) {
      setError(err?.message ?? 'Erreur lors du changement de mot de passe.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-6" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-bold text-gray-900 mb-4">Modifier mon mot de passe</h2>
        {success ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
              Mot de passe modifié avec succès.
            </div>
            <button onClick={onClose} className="w-full py-3.5 text-sm font-semibold bg-slate-900 text-white rounded-2xl">
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Ancien mot de passe</label>
              <input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)} required disabled={saving}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-50" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Nouveau mot de passe</label>
              <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} required disabled={saving}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-50" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Confirmer le nouveau mot de passe</label>
              <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} required disabled={saving}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-50" />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} disabled={saving}
                className="flex-1 py-3 text-sm font-semibold text-gray-700 border border-gray-200 rounded-2xl hover:bg-gray-50 disabled:opacity-50">
                Annuler
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 py-3 text-sm font-semibold text-white bg-slate-900 rounded-2xl disabled:opacity-40 transition-colors">
                {saving ? 'Enregistrement…' : 'Modifier'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default function MonPlanningPage() {
  const { user, role, loading: authLoading, signOut } = useAuth()

  const now = new Date()
  const todayKey = dateStr(now.getFullYear(), now.getMonth(), now.getDate())

  // 0 = mois courant, 1 = mois suivant
  const [offset, setOffset] = useState(0)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
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
  const [nextMonthBlocked, setNextMonthBlocked] = useState(false)

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

    const isNextMonth = year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth())
    if (isNextMonth) {
      const psRes = await supabase.from('planning_status')
        .select('status').eq('team_id', teamId).eq('month', month + 1).eq('year', year).maybeSingle()
      if (psRes.data?.status !== 'publie') {
        setNextMonthBlocked(true)
        setSchedules([])
        setTeamSchedules([])
        setTeamEmployees([])
        setLoadingSched(false)
        return
      }
    }
    setNextMonthBlocked(false)

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
        .select('employee_id, employees(id, first_name, last_name, contract_type, statut)')
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
      if (e && !seen.has(e.id)) {
        seen.add(e.id)
        emps.push({ id: e.id, first_name: e.first_name, last_name: e.last_name, contract_type: e.contract_type ?? null, statut: e.statut ?? null })
      }
    }
    const { permanents, temporaires } = sortEmployees(emps)
    setTeamEmployees([...permanents, ...temporaires])
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

  const isManagement = role === 'admin' || role === 'responsable' || role === 'manager'

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
      {showPasswordModal && <PasswordModal onClose={() => setShowPasswordModal(false)} />}
      {/* Header compact */}
      <div className="bg-slate-900 text-white px-4" style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)', paddingBottom: '8px' }}>
        {/* Ligne 1 : titre + actions */}
        <div className="flex items-center justify-between">
          <span className="text-base font-bold text-white">Musiam Planning</span>
          <div className="flex items-center gap-0.5">
            {isManagement && (
              <a href="/tableau-de-bord"
                className="text-slate-400 text-xs px-2 py-1 rounded-lg active:bg-slate-700 active:text-white font-medium">
                ← Gestion
              </a>
            )}
            <button onClick={() => setShowPasswordModal(true)}
              className="text-slate-500 p-1.5 rounded-lg active:bg-slate-700 active:text-white"
              title="Modifier mon mot de passe">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </button>
            <button onClick={signOut}
              className="text-slate-400 text-xs px-2 py-1 rounded-lg active:bg-slate-700 active:text-white font-medium">
              Quitter
            </button>
          </div>
        </div>
        {/* Ligne 2 : nom + équipe */}
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-sm font-bold text-white">{employee.first_name} {employee.last_name}</span>
          {team && (
            <span className="text-xs text-slate-400">
              {team.name}{team.cdpf ? ` · ${team.cdpf}` : ''}
            </span>
          )}
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
        {tab === 'planning' && nextMonthBlocked && (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <p className="text-gray-600 text-base font-medium">
              Le planning de {MONTHS[month]} {year} n'est pas encore disponible.
            </p>
            <p className="text-sm text-gray-400 mt-2">
              Il sera visible dès sa publication par votre responsable.
            </p>
          </div>
        )}
        {tab === 'planning' && !nextMonthBlocked && (
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
        {tab === 'equipe' && nextMonthBlocked && (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <p className="text-gray-600 text-base font-medium">
              Le planning de {MONTHS[month]} {year} n'est pas encore disponible.
            </p>
          </div>
        )}
        {tab === 'equipe' && !nextMonthBlocked && (
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
                {teamEmployees.map((emp, idx) => {
                  const isMe = emp.id === employeeId
                  const isTmp = isTemporaire(emp.contract_type)
                  const needsSep = idx > 0 && isTmp && !isTemporaire(teamEmployees[idx - 1].contract_type)
                  return (
                    <Fragment key={emp.id}>
                      {needsSep && (
                        <tr>
                          <td colSpan={dates.length + 1} style={{ height: 4, background: '#e2e8f0', padding: 0 }} />
                        </tr>
                      )}
                      <tr>
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
                    </Fragment>
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
