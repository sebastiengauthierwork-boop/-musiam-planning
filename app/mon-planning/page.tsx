'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, Fragment } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { usePermissions } from '@/lib/permissions'
import { useSite } from '@/lib/site-context'
import { isAdmin } from '@/lib/utils'
import { getCodeColor } from '@/lib/utils'
import { sortEmployees, isTemporaire } from '@/lib/employeeUtils'

interface Employee { id: string; first_name: string; last_name: string; contract_type: string | null; statut: string | null }
interface Site { id: string; name: string }
interface Team { id: string; name: string; cdpf: string | null; site_id: string | null }
interface Schedule { employee_id: string; date: string; code: string; start_time: string | null; end_time: string | null }
interface ShiftCode { id: string; code: string; label: string; start_time: string | null; end_time: string | null }
interface AbsenceCode { id: string; code: string; label: string }
interface DashboardEntry { employee_id: string; name: string; code: string; start: string; end: string; statut: string }

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const DAYS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']

const CADRE_TIMES: Record<string, { start: string; end: string }> = {
  'P/O': { start: '05:00', end: '14:00' },
  'P/F': { start: '13:30', end: '22:30' },
  'P':   { start: '11:30', end: '20:30' },
}
const DASHBOARD_STATUT_ORD: Record<string, number> = { cadre: 1, agent_de_maitrise: 2, employe: 3 }

function pad(n: number) { return String(n).padStart(2, '0') }
function dateStr(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}` }

function EyeIcon({ show }: { show: boolean }) {
  return show ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  )
}

function PasswordModal({ onClose }: { onClose: () => void }) {
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
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
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: user?.email ?? '', password: oldPwd })
      if (signInError) { setError('Ancien mot de passe incorrect.'); return }
      const { error: updateError } = await supabase.auth.updateUser({ password: newPwd })
      if (updateError) throw updateError
      setSuccess(true)
    } catch (err: any) {
      setError(err?.message ?? 'Erreur lors du changement de mot de passe.')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-6" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-bold text-gray-900 mb-4">Modifier mon mot de passe</h2>
        {success ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">Mot de passe modifié avec succès.</div>
            <button onClick={onClose} className="w-full py-3.5 text-sm font-semibold bg-slate-900 text-white rounded-2xl">Fermer</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Ancien mot de passe</label>
              <div className="relative">
                <input type={showOld ? 'text' : 'password'} value={oldPwd} onChange={e => setOldPwd(e.target.value)} required disabled={saving}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-50" />
                <button type="button" onClick={() => setShowOld(p => !p)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><EyeIcon show={showOld} /></button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Nouveau mot de passe</label>
              <div className="relative">
                <input type={showNew ? 'text' : 'password'} value={newPwd} onChange={e => setNewPwd(e.target.value)} required disabled={saving}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-50" />
                <button type="button" onClick={() => setShowNew(p => !p)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><EyeIcon show={showNew} /></button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Confirmer le nouveau mot de passe</label>
              <div className="relative">
                <input type={showConfirm ? 'text' : 'password'} value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} required disabled={saving}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-50" />
                <button type="button" onClick={() => setShowConfirm(p => !p)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><EyeIcon show={showConfirm} /></button>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} disabled={saving}
                className="flex-1 py-3 text-sm font-semibold text-gray-700 border border-gray-200 rounded-2xl hover:bg-gray-50 disabled:opacity-50">Annuler</button>
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

// ── Grille équipe réutilisable ────────────────────────────────────────────────

function TeamGrid({ employees, schedules, dates, todayKey, highlightId, shiftCodes, absenceCodes }: {
  employees: Employee[]
  schedules: { employee_id: string; date: string; code: string }[]
  dates: { ds: string; day: number; dow: number }[]
  todayKey: string
  highlightId: string | null
  shiftCodes: ShiftCode[]
  absenceCodes: AbsenceCode[]
}) {
  const schedMap: Record<string, Record<string, string>> = {}
  for (const s of schedules) {
    if (!schedMap[s.employee_id]) schedMap[s.employee_id] = {}
    schedMap[s.employee_id][s.date] = s.code
  }
  return (
    <div className="overflow-x-auto pb-10">
      <table className="border-collapse" style={{ fontSize: 11 }}>
        <thead>
          <tr className="border-b border-gray-100 bg-white sticky top-0 z-10">
            <th className="sticky left-0 bg-white z-20 px-4 py-3 text-left text-xs font-semibold text-gray-500 min-w-[130px] whitespace-nowrap border-r border-gray-100">Salarié</th>
            {dates.map(({ ds, day, dow }) => (
              <th key={ds} className={`w-8 px-0.5 py-3 text-center font-semibold ${ds === todayKey ? 'text-slate-900' : dow === 0 || dow === 6 ? 'text-rose-400' : 'text-gray-400'}`}>
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {employees.map((emp, idx) => {
            const isMe = emp.id === highlightId
            const isTmp = isTemporaire(emp.contract_type)
            const needsSep = idx > 0 && isTmp && !isTemporaire(employees[idx - 1].contract_type)
            return (
              <Fragment key={emp.id}>
                {needsSep && <tr><td colSpan={dates.length + 1} style={{ height: 4, background: '#e2e8f0', padding: 0 }} /></tr>}
                <tr>
                  <td className={`sticky left-0 z-10 px-4 py-2 whitespace-nowrap border-r border-gray-100 text-xs font-semibold ${isMe ? 'bg-blue-50 text-blue-700' : 'bg-white text-gray-700'}`}>
                    {isMe ? '▶ ' : ''}{emp.last_name} {emp.first_name.charAt(0)}.
                  </td>
                  {dates.map(({ ds }) => {
                    const code = schedMap[emp.id]?.[ds] ?? ''
                    const colors = code ? getCodeColor(code, shiftCodes, absenceCodes) : null
                    return (
                      <td key={ds} className={`px-0.5 py-1 ${isMe ? 'bg-blue-50/40' : ''}`}>
                        {code ? (
                          <span className="flex items-center justify-center w-7 h-7 rounded-md font-bold"
                            style={{ fontSize: 10, background: colors?.bg, color: colors?.text }}>
                            {code.slice(0, 3)}
                          </span>
                        ) : <span className="block w-7 h-7" />}
                      </td>
                    )
                  })}
                </tr>
              </Fragment>
            )
          })}
          {employees.length === 0 && (
            <tr>
              <td colSpan={dates.length + 1} className="px-4 py-8 text-center text-gray-400 text-sm">Aucun membre d'équipe trouvé.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Sélecteur de mois ─────────────────────────────────────────────────────────

function MonthSelector({ offset, setOffset, year, month, loading }: {
  offset: number; setOffset: (v: number) => void; year: number; month: number; loading: boolean
}) {
  return (
    <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between shrink-0">
      <button onClick={() => setOffset(0)} disabled={offset === 0}
        className="min-h-[44px] px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 disabled:opacity-25 active:bg-gray-100">← Actuel</button>
      <span className="text-base font-bold text-gray-900">
        {MONTHS[month]} {year}
        {loading && <span className="ml-2 text-xs text-gray-400 font-normal">…</span>}
      </span>
      <button onClick={() => setOffset(1)} disabled={offset === 1}
        className="min-h-[44px] px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 disabled:opacity-25 active:bg-gray-100">Suivant →</button>
    </div>
  )
}

// ── Gantt mobile du tableau de bord ──────────────────────────────────────────

function MobileGantt({ entries, shiftCodes, absenceCodes }: {
  entries: DashboardEntry[]
  shiftCodes: ShiftCode[]
  absenceCodes: AbsenceCode[]
}) {
  const START_MIN = 4 * 60
  const END_MIN = 23 * 60
  const SPAN = END_MIN - START_MIN
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const ticks = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22]
  const NAME_W = 80
  const BAR_H = 28

  if (entries.length === 0) {
    return <p className="text-sm text-gray-400 italic text-center py-10">Aucun salarié planifié aujourd'hui.</p>
  }

  return (
    <div>
      {/* Axe horaire */}
      <div className="flex items-center bg-gray-50 border-b border-gray-200" style={{ height: 22 }}>
        <div style={{ width: NAME_W, flexShrink: 0 }} />
        <div className="flex-1 relative" style={{ height: 22 }}>
          {ticks.map(h => {
            const pct = ((h * 60 - START_MIN) / SPAN) * 100
            return (
              <span key={h} className="absolute text-gray-400 -translate-x-1/2" style={{ left: `${pct}%`, top: 4, fontSize: 9 }}>
                {h}h
              </span>
            )
          })}
        </div>
      </div>

      {/* Barres */}
      <div className="pt-1">
        {entries.map(e => {
          const hasTimes = !!e.start && !!e.end
          let leftPct = 0, widthPct = 100
          if (hasTimes) {
            const s = Math.max(toMin(e.start), START_MIN)
            const en = Math.min(toMin(e.end), END_MIN)
            leftPct = ((s - START_MIN) / SPAN) * 100
            widthPct = Math.max(((en - s) / SPAN) * 100, 2)
          }
          const color = getCodeColor(e.code, shiftCodes, absenceCodes)
          const isCadreCode = e.code in CADRE_TIMES
          const barLabel = isCadreCode ? e.code : (hasTimes ? `${e.code} ${e.start}-${e.end}` : e.code)

          return (
            <div key={e.employee_id} className="flex items-center" style={{ marginBottom: 4 }}>
              <div style={{ width: NAME_W, flexShrink: 0, paddingRight: 4, fontSize: 11, textAlign: 'right' }}
                className="text-gray-700 font-semibold truncate">
                {e.name}
              </div>
              <div className="flex-1 relative" style={{ height: BAR_H, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                {ticks.map(h => {
                  const pct = ((h * 60 - START_MIN) / SPAN) * 100
                  return <div key={h} style={{ position: 'absolute', left: `${pct}%`, top: 0, bottom: 0, width: 1, background: '#e5e7eb' }} />
                })}
                <div style={{
                  position: 'absolute', top: 2, bottom: 2,
                  left: `${leftPct}%`, width: `${widthPct}%`,
                  background: color.bg, borderRadius: 3,
                  display: 'flex', alignItems: 'center',
                  paddingLeft: 3, paddingRight: 3, overflow: 'hidden',
                }}>
                  <span style={{ fontSize: 9, color: color.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {barLabel}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function MonPlanningPage() {
  const { role, allowedTeams, allowedSiteId: authSiteId, employeeId, loading: authLoading, signOut } = useAuth()
  const { can } = usePermissions()
  const { selectedSite } = useSite()
  const dressingMinutes = selectedSite?.dressing_minutes_per_day ?? 10

  const now = new Date()
  const todayKey = dateStr(now.getFullYear(), now.getMonth(), now.getDate())

  const [offset, setOffset] = useState(0)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const monthDate = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()

  const isMgmt = isAdmin(role) || role === 'responsable' || role === 'manager'

  // ── Tab state ──
  // mgmt: 'browser' (équipes) | 'personal' (mon planning, si employeeId)
  // salarié: 'planning' | 'equipe'
  const [tab, setTab] = useState<string>('planning')
  useEffect(() => {
    if (!authLoading && role) setTab(isMgmt ? 'browser' : 'planning')
  }, [authLoading, isMgmt])

  // ── Codes partagés ──
  const [shiftCodes, setShiftCodes] = useState<ShiftCode[]>([])
  const [absenceCodes, setAbsenceCodes] = useState<AbsenceCode[]>([])

  // ── Management : parcours d'équipes ──
  const [sites, setSites] = useState<Site[]>([])
  const [allTeams, setAllTeams] = useState<Team[]>([])
  const [selectedSiteId, setSelectedSiteId] = useState<string>('')
  const [browsedTeamId, setBrowsedTeamId] = useState<string>('')
  const [browsedEmployees, setBrowsedEmployees] = useState<Employee[]>([])
  const [browsedSchedules, setBrowsedSchedules] = useState<{ employee_id: string; date: string; code: string }[]>([])
  const [loadingBrowse, setLoadingBrowse] = useState(false)

  // ── Salarié / planning personnel ──
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [team, setTeam] = useState<Team | null>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [teamEmployees, setTeamEmployees] = useState<Employee[]>([])
  const [teamSchedules, setTeamSchedules] = useState<{ employee_id: string; date: string; code: string }[]>([])
  const [loadingStatic, setLoadingStatic] = useState(true)
  const [loadingSched, setLoadingSched] = useState(false)
  const [nextMonthBlocked, setNextMonthBlocked] = useState<boolean | null>(null)

  const [error, setError] = useState<string | null>(null)

  // ── Tableau de bord mobile ──
  const [dashboardEntries, setDashboardEntries] = useState<DashboardEntry[]>([])
  const [loadingDashboard, setLoadingDashboard] = useState(false)
  const [dashboardSiteId, setDashboardSiteId] = useState<string>('')
  const [dashboardTeamId, setDashboardTeamId] = useState<string>('')

  // PWA
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])

  // ── Codes shift/absence ──
  useEffect(() => {
    if (authLoading) return
    Promise.all([
      supabase.from('shift_codes').select('id, code, label, start_time, end_time, color').order('code'),
      supabase.from('absence_codes').select('id, code, label, color').order('code'),
    ]).then(([scRes, acRes]) => {
      setShiftCodes(scRes.data ?? [])
      setAbsenceCodes(acRes.data ?? [])
    })
  }, [authLoading])

  // ── Tableau de bord mobile : init sélecteur site ──
  useEffect(() => {
    if (!isMgmt || sites.length === 0) return
    setDashboardSiteId(prev => prev || (role === 'responsable' && authSiteId ? authSiteId : (sites[0]?.id ?? '')))
  }, [isMgmt, sites.map(s => s.id).join(',')])

  // ── Tableau de bord mobile : init sélecteur équipe ──
  useEffect(() => {
    if (!isMgmt || allTeams.length === 0) return
    const filtered = role === 'manager' ? allTeams : allTeams.filter(t => t.site_id === dashboardSiteId)
    setDashboardTeamId(prev => (prev && filtered.find(t => t.id === prev)) ? prev : (filtered[0]?.id ?? ''))
  }, [dashboardSiteId, allTeams.map(t => t.id).join(','), isMgmt, role])

  // ── Tableau de bord mobile : chargement données du jour ──
  useEffect(() => {
    if (authLoading) return
    const resolvedTeamId = (team as any)?.id ?? null
    const teamIds: string[] = []
    if (isMgmt) {
      if (allTeams.length === 0 || !dashboardTeamId) return
      teamIds.push(dashboardTeamId)
    } else {
      if (!resolvedTeamId) return
      teamIds.push(resolvedTeamId)
    }
    setLoadingDashboard(true)
    Promise.all([
      supabase.from('schedules')
        .select('employee_id, code, start_time, end_time, employees(first_name, last_name, statut)')
        .in('team_id', teamIds).eq('date', todayKey),
      supabase.from('shift_codes').select('code, start_time, end_time'),
      supabase.from('absence_codes').select('code'),
    ]).then(([schedRes, scRes, absRes]) => {
      const scTimeMap: Record<string, { start: string; end: string }> = {}
      for (const sc of scRes.data ?? []) {
        if (sc.code && sc.start_time && sc.end_time && !(sc.code in scTimeMap)) {
          scTimeMap[sc.code] = { start: sc.start_time.slice(0, 5), end: sc.end_time.slice(0, 5) }
        }
      }
      const absenceSet = new Set<string>((absRes.data ?? []).map((a: any) => a.code).filter(Boolean))
      const REPOS_CODES = new Set(['R', 'REP', 'FER'])
      const seen = new Set<string>()
      const entries: DashboardEntry[] = []
      for (const s of (schedRes.data ?? []) as any[]) {
        if (seen.has(s.employee_id)) continue
        const code = s.code ?? ''
        if (REPOS_CODES.has(code) || absenceSet.has(code)) continue
        let start: string, end: string
        if (scTimeMap[code]) {
          start = scTimeMap[code].start; end = scTimeMap[code].end
        } else if (code in CADRE_TIMES) {
          start = CADRE_TIMES[code].start; end = CADRE_TIMES[code].end
        } else {
          continue
        }
        seen.add(s.employee_id)
        const emp = s.employees
        if (!emp) continue
        entries.push({ employee_id: s.employee_id, name: `${emp.last_name} ${emp.first_name.charAt(0)}.`, code, start, end, statut: emp.statut ?? '' })
      }
      entries.sort((a, b) => {
        const oa = DASHBOARD_STATUT_ORD[a.statut] ?? 3
        const ob = DASHBOARD_STATUT_ORD[b.statut] ?? 3
        if (oa !== ob) return oa - ob
        return a.name.localeCompare(b.name)
      })
      setDashboardEntries(entries)
      setLoadingDashboard(false)
    }).catch(() => setLoadingDashboard(false))
  }, [authLoading, isMgmt, allTeams.map(t => t.id).join(','), (team as any)?.id, dashboardTeamId, todayKey])

  // ── Management : chargement sites + équipes ──
  useEffect(() => {
    if (authLoading || !isMgmt) return
    const load = async () => {
      if (role !== 'manager') {
        let sitesQ = supabase.from('sites').select('id, name').eq('is_active', true).order('name')
        if (role === 'responsable' && authSiteId) sitesQ = sitesQ.eq('id', authSiteId)
        const { data: sitesData } = await sitesQ
        setSites(sitesData ?? [])
        const initSite = role === 'responsable' && authSiteId ? authSiteId : (sitesData?.[0]?.id ?? '')
        setSelectedSiteId(initSite)
      }
      let teamsQ = supabase.from('teams').select('id, name, cdpf, site_id').order('name')
      if (!isAdmin(role) && role === 'manager' && allowedTeams.length > 0) teamsQ = teamsQ.in('id', allowedTeams)
      const { data: teamsData } = await teamsQ
      setAllTeams(teamsData ?? [])
    }
    load().catch(e => setError(e?.message ?? String(e)))
  }, [authLoading, isMgmt, role, authSiteId, allowedTeams.join(',')])

  // ── Sélection automatique d'équipe quand le site ou la liste change ──
  useEffect(() => {
    if (!isMgmt || allTeams.length === 0) return
    const filtered = role === 'manager' ? allTeams : allTeams.filter(t => t.site_id === selectedSiteId)
    setBrowsedTeamId(prev => (prev && filtered.find(t => t.id === prev)) ? prev : (filtered[0]?.id ?? ''))
  }, [selectedSiteId, allTeams, isMgmt, role])

  // ── Management : planning d'une équipe ──
  useEffect(() => {
    if (!isMgmt || !browsedTeamId) return
    setLoadingBrowse(true)
    const start = `${year}-${pad(month + 1)}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const end = `${year}-${pad(month + 1)}-${lastDay}`
    Promise.all([
      supabase.from('employee_teams')
        .select('employee_id, employees(id, first_name, last_name, contract_type, statut)')
        .eq('team_id', browsedTeamId),
      supabase.from('schedules')
        .select('employee_id, date, code')
        .eq('team_id', browsedTeamId).gte('date', start).lte('date', end).limit(5000),
    ]).then(([etRes, schedRes]) => {
      const emps: Employee[] = []
      const seen = new Set<string>()
      for (const et of (etRes.data ?? []) as any[]) {
        const e = et.employees
        if (e && !seen.has(e.id)) { seen.add(e.id); emps.push({ id: e.id, first_name: e.first_name, last_name: e.last_name, contract_type: e.contract_type ?? null, statut: e.statut ?? null }) }
      }
      const { permanents, temporaires } = sortEmployees(emps)
      setBrowsedEmployees([...permanents, ...temporaires])
      setBrowsedSchedules(schedRes.data ?? [])
      setLoadingBrowse(false)
    }).catch(e => { setError(e?.message ?? String(e)); setLoadingBrowse(false) })
  }, [isMgmt, browsedTeamId, year, month])

  // ── Planning personnel (salarié ou admin avec employee_id) ──
  useEffect(() => {
    if (isMgmt && !employeeId) { setLoadingStatic(false); return }
    if (!employeeId) { setLoadingStatic(false); return }
    Promise.all([
      supabase.from('employees').select('id, first_name, last_name').eq('id', employeeId).single(),
      supabase.from('employee_teams')
        .select('team_id, teams(id, name, cdpf)')
        .eq('employee_id', employeeId).eq('is_primary', true).maybeSingle(),
    ]).then(([empRes, teamRes]) => {
      setEmployee(empRes.data ?? null)
      setTeam((teamRes.data as any)?.teams ?? null)
      setLoadingStatic(false)
    }).catch(e => { setError(e?.message ?? String(e)); setLoadingStatic(false) })
  }, [employeeId, isMgmt])

  const teamId = (team as any)?.id ?? null

  const loadSchedules = useCallback(async () => {
    if (!employeeId || !teamId) return
    setLoadingSched(true)
    setSchedules([]); setTeamSchedules([]); setTeamEmployees([])

    if (!isMgmt) {
      setNextMonthBlocked(null)
      const psRes = await supabase.from('planning_status')
        .select('status').eq('team_id', teamId).eq('month', month + 1).eq('year', year).maybeSingle()
      if (psRes.data?.status !== 'publie') { setNextMonthBlocked(true); setLoadingSched(false); return }
    }
    setNextMonthBlocked(false)

    const start = `${year}-${pad(month + 1)}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const end = `${year}-${pad(month + 1)}-${lastDay}`

    const [myRes, etRes, tschedRes] = await Promise.all([
      supabase.from('schedules').select('employee_id, date, code, start_time, end_time')
        .eq('employee_id', employeeId).eq('team_id', teamId).gte('date', start).lte('date', end),
      supabase.from('employee_teams').select('employee_id, employees(id, first_name, last_name, contract_type, statut)').eq('team_id', teamId),
      supabase.from('schedules').select('employee_id, date, code').eq('team_id', teamId).gte('date', start).lte('date', end).limit(5000),
    ])

    setSchedules(myRes.data ?? [])
    const emps: Employee[] = []
    const seen = new Set<string>()
    for (const et of (etRes.data ?? []) as any[]) {
      const e = et.employees
      if (e && !seen.has(e.id)) { seen.add(e.id); emps.push({ id: e.id, first_name: e.first_name, last_name: e.last_name, contract_type: e.contract_type ?? null, statut: e.statut ?? null }) }
    }
    const { permanents, temporaires } = sortEmployees(emps)
    setTeamEmployees([...permanents, ...temporaires])
    setTeamSchedules(tschedRes.data ?? [])
    setLoadingSched(false)
  }, [employeeId, teamId, year, month, isMgmt])

  useEffect(() => { loadSchedules() }, [loadSchedules])

  useEffect(() => {
    const handleVisibility = () => { if (document.visibilityState === 'visible') loadSchedules() }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [loadSchedules])

  useEffect(() => {
    if (!teamId || !employeeId || isMgmt) return
    supabase.from('planning_status')
      .select('status').eq('team_id', teamId).eq('month', month + 1).eq('year', year)
      .maybeSingle()
      .then(({ data }: { data: any }) => {
        if (data?.status !== 'publie') {
          setNextMonthBlocked(true); setTeamSchedules([]); setTeamEmployees([]); setSchedules([])
        } else { setNextMonthBlocked(false) }
      })
  }, [tab, teamId, year, month, employeeId, isMgmt])

  // ── Guards ──

  if (authLoading || (!isMgmt && loadingStatic)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-gray-400 text-base">Chargement…</p>
      </div>
    )
  }

  if (!isMgmt && (!employeeId || !employee)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 px-6">
        <div className="text-center">
          <p className="text-base font-semibold text-gray-800">Compte non lié à un salarié</p>
          <p className="text-sm text-gray-400 mt-1">Contactez votre administrateur.</p>
          <button onClick={signOut} className="mt-6 w-full py-3.5 bg-slate-900 text-white rounded-2xl text-base font-semibold">Se déconnecter</button>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 px-6">
        <div className="text-center">
          <p className="text-base text-red-600 font-medium">Erreur : {error}</p>
          <button onClick={() => window.location.reload()} className="mt-4 px-6 py-3 bg-slate-900 text-white rounded-2xl text-base">Réessayer</button>
        </div>
      </div>
    )
  }

  // ── Données calculées ──

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const dates = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month, i + 1)
    return { ds: dateStr(year, month, i + 1), day: i + 1, dow: d.getDay() }
  })

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month, i + 1)
    const ds = dateStr(year, month, i + 1)
    const sched = schedules.find(s => s.date === ds)
    const code = sched?.code ?? null
    const colors = code ? getCodeColor(code, shiftCodes, absenceCodes) : null
    const sc = code ? shiftCodes.find(c => c.code === code) : null
    return { d, ds, code, colors, sc, isToday: ds === todayKey, isWE: d.getDay() === 0 || d.getDay() === 6 }
  })

  // Équipes filtrées par site courant (pour le dropdown de l'onglet Équipes)
  const teamsForSite = role === 'manager' ? allTeams : allTeams.filter(t => t.site_id === selectedSiteId)
  // Équipes filtrées pour le sélecteur du tableau de bord mobile
  const dashboardTeamsForSite = role === 'manager' ? allTeams : allTeams.filter(t => t.site_id === dashboardSiteId)

  // Onglets disponibles
  const tabs = [
    ...(isMgmt ? [{ id: 'browser', label: 'Équipes' }] : []),
    ...(isMgmt && employeeId && employee ? [{ id: 'personal', label: 'Mon planning' }] : []),
    ...(!isMgmt ? [{ id: 'planning', label: 'Mon planning' }] : []),
    ...(!isMgmt ? [{ id: 'equipe', label: 'Mon équipe' }] : []),
    ...(can('view_dashboard_mobile') ? [{ id: 'dashboard', label: 'Tableau de bord' }] : []),
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ maxWidth: 600, margin: '0 auto' }}>
      {showPasswordModal && <PasswordModal onClose={() => setShowPasswordModal(false)} />}

      {/* Header */}
      <div className="bg-slate-900 text-white px-4" style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)', paddingBottom: '8px' }}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-base font-bold text-white">Musiam Planning</span>
            <p className="text-slate-400 text-xs italic">by Planekipe</p>
          </div>
          <div className="flex items-center gap-0.5">
            {isMgmt && (
              <a href="/tableau-de-bord" className="text-slate-400 text-xs px-2 py-1 rounded-lg active:bg-slate-700 active:text-white font-medium">← Gestion</a>
            )}
            <button onClick={() => setShowPasswordModal(true)} className="text-slate-500 p-1.5 rounded-lg active:bg-slate-700 active:text-white" title="Modifier mon mot de passe">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </button>
            <button onClick={signOut} className="text-slate-400 text-xs px-2 py-1 rounded-lg active:bg-slate-700 active:text-white font-medium">Quitter</button>
          </div>
        </div>
        {/* Sous-titre selon rôle */}
        {isMgmt ? (
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{role}</p>
        ) : employee && (
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-sm font-bold text-white">{employee.first_name} {employee.last_name}</span>
            {team && <span className="text-xs text-slate-400">{team.name}{(team as any).cdpf ? ` · ${(team as any).cdpf}` : ''}</span>}
          </div>
        )}
      </div>

      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="bg-white border-b border-gray-200 flex sticky top-0 z-20 shrink-0">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-4 text-base font-semibold border-b-2 transition-colors ${
                tab === t.id ? 'border-slate-900 text-slate-900' : 'border-transparent text-gray-400'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Onglet Équipes (management) ── */}
      {tab === 'browser' && (
        <>
          {/* Dropdowns site + équipe */}
          <div className="bg-white border-b border-gray-100 px-4 py-3 space-y-2.5 shrink-0">
            {role !== 'manager' && sites.length > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-gray-500 w-12 shrink-0">Site</span>
                <select value={selectedSiteId} onChange={e => setSelectedSiteId(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-slate-200">
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-gray-500 w-12 shrink-0">Équipe</span>
              <select value={browsedTeamId} onChange={e => setBrowsedTeamId(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-slate-200">
                {teamsForSite.map(t => <option key={t.id} value={t.id}>{t.name}{t.cdpf ? ` · ${t.cdpf}` : ''}</option>)}
                {teamsForSite.length === 0 && <option value="">Aucune équipe</option>}
              </select>
            </div>
          </div>

          <MonthSelector offset={offset} setOffset={setOffset} year={year} month={month} loading={loadingBrowse} />

          <div className="flex-1 overflow-y-auto">
            {loadingBrowse ? (
              <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Chargement…</div>
            ) : !browsedTeamId ? (
              <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Sélectionnez une équipe.</div>
            ) : (
              <TeamGrid employees={browsedEmployees} schedules={browsedSchedules} dates={dates} todayKey={todayKey} highlightId={employeeId} shiftCodes={shiftCodes} absenceCodes={absenceCodes} />
            )}
          </div>
        </>
      )}

      {/* ── Onglet Mon planning (personnel) ── */}
      {(tab === 'planning' || tab === 'personal') && (
        <>
          <MonthSelector offset={offset} setOffset={setOffset} year={year} month={month} loading={loadingSched} />
          <div className="flex-1 overflow-y-auto">
            {nextMonthBlocked === true ? (
              <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                <p className="text-gray-600 text-base font-medium">Le planning de {MONTHS[month]} {year} n'est pas encore disponible.</p>
                {!isMgmt && <p className="text-sm text-gray-400 mt-2">Il sera visible dès sa publication par votre responsable.</p>}
              </div>
            ) : (
              <div className="p-4 space-y-2 pb-10">
                {days.map(({ d, ds, code, colors, sc, isToday, isWE }) => (
                  <div key={ds} className={`rounded-2xl border bg-white flex items-center gap-4 px-4 py-3.5 ${isToday ? 'border-slate-900 shadow-sm' : 'border-gray-100'}`}>
                    <div className="min-w-[52px] flex-shrink-0 text-center">
                      <div className={`text-xs font-bold uppercase tracking-wide ${isWE ? 'text-rose-400' : 'text-gray-400'}`}>{DAYS[d.getDay()].slice(0, 3)}</div>
                      <div className={`text-3xl font-bold leading-none mt-0.5 ${isToday ? 'text-slate-900' : 'text-gray-800'}`}>{d.getDate()}</div>
                    </div>
                    <div className="w-px self-stretch bg-gray-100 flex-shrink-0" />
                    <div className="flex-1 flex items-center gap-3 min-w-0">
                      {code ? (
                        <>
                          <span className="flex-shrink-0 px-3 py-1.5 rounded-xl text-base font-bold" style={{ background: colors?.bg, color: colors?.text }}>{code}</span>
                          {sc?.start_time && <span className="text-sm text-gray-500 font-medium">{sc.start_time.slice(0, 5)}&nbsp;–&nbsp;{(sc as any).end_time?.slice(0, 5)}</span>}
                        </>
                      ) : (
                        <span className="text-gray-300 text-sm italic">Non planifié</span>
                      )}
                    </div>
                    {isToday && <span className="flex-shrink-0 text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-full">Auj.</span>}
                  </div>
                ))}
                {dressingMinutes > 0 && (
                  <p className="text-xs text-gray-400 text-center pt-2 px-2">
                    Les horaires indiqués correspondent à la prise de poste en tenue. Un temps d&apos;habillage de {dressingMinutes} minutes par jour est comptabilisé en sus des horaires affichés.
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Onglet Mon équipe (salarié uniquement) ── */}
      {tab === 'equipe' && (
        <>
          <MonthSelector offset={offset} setOffset={setOffset} year={year} month={month} loading={loadingSched} />
          <div className="flex-1 overflow-y-auto">
            {nextMonthBlocked === true ? (
              <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                <p className="text-gray-600 text-base font-medium">Le planning de {MONTHS[month]} {year} n'est pas encore disponible.</p>
              </div>
            ) : (
              <TeamGrid employees={teamEmployees} schedules={teamSchedules} dates={dates} todayKey={todayKey} highlightId={employeeId} shiftCodes={shiftCodes} absenceCodes={absenceCodes} />
            )}
          </div>
        </>
      )}

      {/* ── Onglet Tableau de bord mobile ── */}
      {tab === 'dashboard' && (
        <div className="flex-1 overflow-y-auto">
          {/* Sélecteurs site/équipe (gestionnaires uniquement) */}
          {isMgmt && (role !== 'manager' && sites.length > 1 || dashboardTeamsForSite.length > 1) && (
            <div className="bg-white border-b border-gray-100 px-3 py-2 space-y-1.5 shrink-0">
              {role !== 'manager' && sites.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500 w-10 shrink-0">Site</span>
                  <select value={dashboardSiteId} onChange={e => setDashboardSiteId(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white text-gray-800 focus:outline-none">
                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              {dashboardTeamsForSite.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500 w-10 shrink-0">Équipe</span>
                  <select value={dashboardTeamId} onChange={e => setDashboardTeamId(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white text-gray-800 focus:outline-none">
                    {dashboardTeamsForSite.map(t => <option key={t.id} value={t.id}>{t.name}{t.cdpf ? ` · ${t.cdpf}` : ''}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}
          <div className="bg-white border-b border-gray-100 px-4 py-3 shrink-0">
            <p className="text-sm font-bold text-gray-900">Effectifs du jour</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {DAYS[now.getDay()]} {now.getDate()} {MONTHS[now.getMonth()]} {now.getFullYear()}
              {!loadingDashboard && (
                <span className="ml-2">· {dashboardEntries.length} présent{dashboardEntries.length > 1 ? 's' : ''}</span>
              )}
            </p>
          </div>
          {loadingDashboard ? (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Chargement…</div>
          ) : (
            <div className="px-3 pt-2 pb-10">
              <MobileGantt entries={dashboardEntries} shiftCodes={shiftCodes} absenceCodes={absenceCodes} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
