'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSite } from '@/lib/site-context'
import { useAuth } from '@/lib/auth'
import { getCodeColor, isAdmin } from '@/lib/utils'

type ContactUtile = { id: string; role_label: string; contact_name: string | null; phone: string | null; email: string | null }

const MONTHS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
const DAYS_SHORT = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam']

function pad(n: number) { return String(n).padStart(2, '0') }
function toISO(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` }
function fmtH(h: number): string {
  const abs = Math.abs(h)
  const hours = Math.floor(abs)
  const mins = Math.round((abs - hours) * 60)
  const str = mins === 0 ? `${hours}h` : `${hours}h${String(mins).padStart(2, '0')}`
  return h < 0 ? `−${str}` : str
}

type GanttEntry = { employee_id: string; name: string; start: string; end: string; code: string; statut: string; team_id: string }
type DayVigilance = { date: string; label: string; planned: number; theoretical: number | null }
type BudgetData = { realized: number; forecast: number; budget: number }

const CADRE_INDICATIVE_DASH: Record<string, [string, string]> = {
  'P/O': ['05:00', '14:00'],
  'P/F': ['13:30', '22:30'],
  'P':   ['11:30', '20:30'],
}
const STATUT_ORD: Record<string, number> = { cadre: 1, agent_de_maitrise: 2, employe: 3 }

export default function TableauDeBord() {
  const { selectedSiteId } = useSite()
  const { role } = useAuth()
  const now = new Date()
  const todayStr = toISO(now)

  const loadIdRef = useRef(0)
  const [loading, setLoading] = useState(true)
  const [contacts, setContacts] = useState<ContactUtile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ganttEntries, setGanttEntries] = useState<GanttEntry[]>([])
  const [vigilance, setVigilance] = useState<DayVigilance[]>([])
  const [budget, setBudget] = useState<BudgetData>({ realized: 0, forecast: 0, budget: 0 })
  const [teamCount, setTeamCount] = useState(0)
  const [employeeCount, setEmployeeCount] = useState(0)
  const [ganttTeams, setGanttTeams] = useState<{ id: string; name: string; cdpf: string | null }[]>([])
  const [ganttTeamId, setGanttTeamId] = useState<string>('')

  useEffect(() => { load() }, [selectedSiteId])

  useEffect(() => {
    const canSee = isAdmin(role) || role === 'responsable' || role === 'manager'
    if (!canSee || !selectedSiteId) { setContacts([]); return }
    supabase.from('contacts_utiles')
      .select('id, role_label, contact_name, phone, email')
      .eq('site_id', selectedSiteId).order('sort_order')
      .then(({ data }: { data: ContactUtile[] | null }) => setContacts(data ?? []))
      .catch(() => setContacts([]))
  }, [selectedSiteId, role])

  async function load() {
    const loadId = ++loadIdRef.current
    setLoading(true)
    setError(null)
    try {
      // 1. Teams
      let teamsQ = supabase.from('teams').select('id, name, cdpf')
      if (selectedSiteId) teamsQ = teamsQ.eq('site_id', selectedSiteId)
      const teamsRes = await teamsQ
      if (teamsRes.error) throw teamsRes.error

      const teams = teamsRes.data ?? []
      const teamIds = teams.map((t: any) => t.id)
      setTeamCount(teams.length)
      setGanttTeams(teams.map((t: any) => ({ id: t.id, name: t.name ?? '', cdpf: t.cdpf ?? null })))
      setGanttTeamId('')

      if (!teamIds.length) { setLoading(false); return }

      // 2. Shift codes map (code → paid_hours + times) + absence codes
      const [scRes, absRes] = await Promise.all([
        supabase.from('shift_codes').select('code, start_time, end_time, paid_hours'),
        supabase.from('absence_codes').select('code'),
      ])
      const scMap: Record<string, number> = {}
      const scTimeMap: Record<string, { start: string; end: string }> = {}
      for (const sc of scRes.data ?? []) {
        if (!sc.code) continue
        if (!(sc.code in scMap)) scMap[sc.code] = Number(sc.paid_hours ?? 0)
        if (sc.start_time && sc.end_time && !(sc.code in scTimeMap)) {
          scTimeMap[sc.code] = { start: sc.start_time.slice(0, 5), end: sc.end_time.slice(0, 5) }
        }
      }
      const absenceSet = new Set<string>((absRes.data ?? []).map((a: any) => a.code).filter(Boolean))

      // 3. Dates J+5
      const next5: Date[] = Array.from({ length: 5 }, (_, i) => {
        const d = new Date(now); d.setDate(d.getDate() + i + 1); return d
      })
      const next5Strs = next5.map(toISO)

      // 4. Mois courant
      const firstOfMonth = `${now.getFullYear()}-${pad(now.getMonth()+1)}-01`
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      const lastOfMonth = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${lastDay}`

      // 5. Requêtes parallèles — calRes couvre tout le mois (vigilance + budget)
      const [todayRes, next5Res, monthRes, calRes, empRes] = await Promise.all([
        supabase.from('schedules')
          .select('employee_id, code, team_id, employees(first_name, last_name, statut)')
          .in('team_id', teamIds).eq('date', todayStr),
        supabase.from('schedules')
          .select('date, employee_id, code')
          .in('team_id', teamIds).in('date', next5Strs),
        supabase.from('schedules')
          .select('date, code, type')
          .in('team_id', teamIds).gte('date', firstOfMonth).lte('date', lastOfMonth),
        supabase.from('annual_calendar')
          .select('date, structure_id')
          .in('team_id', teamIds).gte('date', firstOfMonth).lte('date', lastOfMonth),
        supabase.from('employee_teams')
          .select('employee_id', { count: 'exact', head: true })
          .in('team_id', teamIds),
      ])

      setEmployeeCount(empRes.count ?? 0)

      // 6. Effectifs du jour — Gantt (horaires depuis shift_codes, jamais depuis schedules)
      const REPOS_CODES = new Set(['R', 'REP', 'FER'])
      const seenEmp = new Set<string>()
      const gantt: GanttEntry[] = []
      for (const s of (todayRes.data ?? []) as any[]) {
        if (seenEmp.has(s.employee_id)) continue
        const code = s.code ?? ''
        if (REPOS_CODES.has(code) || absenceSet.has(code)) continue
        let startStr: string, endStr: string
        if (scTimeMap[code]) {
          startStr = scTimeMap[code].start
          endStr = scTimeMap[code].end
        } else if (code in CADRE_INDICATIVE_DASH) {
          ;[startStr, endStr] = CADRE_INDICATIVE_DASH[code]
        } else {
          continue
        }
        seenEmp.add(s.employee_id)
        const emp = s.employees
        const name = emp ? `${emp.last_name ?? ''} ${emp.first_name ?? ''}`.trim() : s.employee_id
        gantt.push({ employee_id: s.employee_id, name, start: startStr, end: endStr, code, statut: emp?.statut ?? '', team_id: s.team_id ?? '' })
      }
      gantt.sort((a, b) => {
        const oa = STATUT_ORD[a.statut] ?? 3
        const ob = STATUT_ORD[b.statut] ?? 3
        if (oa !== ob) return oa - ob
        return a.name.localeCompare(b.name)
      })
      if (loadId !== loadIdRef.current) return
      setGanttEntries(gantt)

      // 7. Structure positions (vigilance + budget, une seule requête)
      const allStructureIds = [...new Set((calRes.data ?? []).map((c: any) => c.structure_id).filter(Boolean))]
      const structureReq: Record<string, number> = {}   // pour vigilance (nb personnes)
      const structHoursMap: Record<string, number> = {} // pour budget (heures payées)

      if (allStructureIds.length) {
        const { data: spData } = await supabase
          .from('staffing_structure_positions').select('structure_id, position_name, required_count')
          .in('structure_id', allStructureIds)
        for (const sp of spData ?? []) {
          structureReq[sp.structure_id] = (structureReq[sp.structure_id] ?? 0) + sp.required_count
          const paidH = scMap[sp.position_name] ?? 0
          structHoursMap[sp.structure_id] = (structHoursMap[sp.structure_id] ?? 0) + paidH * sp.required_count
        }
      }

      // 8. Vigilance J+5 — présent = code dans scTimeMap ou cadre, pas repos ni absence
      const plannedByDay: Record<string, Set<string>> = {}
      for (const s of next5Res.data ?? []) {
        const c = s.code ?? ''
        if (REPOS_CODES.has(c) || absenceSet.has(c)) continue
        if (!(c in scTimeMap) && !(c in CADRE_INDICATIVE_DASH)) continue
        if (!plannedByDay[s.date]) plannedByDay[s.date] = new Set()
        plannedByDay[s.date].add(s.employee_id)
      }

      const theoreticalByDate: Record<string, number | null> = {}
      for (const ds of next5Strs) {
        const entries = (calRes.data ?? []).filter((c: any) => c.date === ds && c.structure_id)
        if (!entries.length) { theoreticalByDate[ds] = null; continue }
        theoreticalByDate[ds] = entries.reduce((s: number, c: any) => s + (structureReq[c.structure_id] ?? 0), 0)
      }

      if (loadId !== loadIdRef.current) return
      setVigilance(next5.map(d => {
        const ds = toISO(d)
        return { date: ds, label: `${DAYS_SHORT[d.getDay()]} ${d.getDate()}`, planned: plannedByDay[ds]?.size ?? 0, theoretical: theoreticalByDate[ds] ?? null }
      }))

      // 9. Budget structure — somme paid_hours × effectif_requis pour chaque jour du mois
      let structBudget = 0
      for (const c of calRes.data ?? []) {
        if (c.structure_id) structBudget += structHoursMap[c.structure_id] ?? 0
      }

      // 10. Heures planifiées (schedules du mois) — uniquement les codes avec paid_hours
      let realized = 0, forecast = 0
      for (const s of monthRes.data ?? []) {
        const h = scMap[s.code] ?? 0
        if (h <= 0) continue
        if (s.date <= todayStr) realized += h
        else forecast += h
      }
      if (loadId !== loadIdRef.current) return
      setBudget({ realized, forecast, budget: structBudget })

    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <SkeletonDashboard />
  if (error) return <div className="p-8"><div className="bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">Erreur : {error}</div></div>

  const monthLabel = `${MONTHS_FR[now.getMonth()]} ${now.getFullYear()}`
  const planned = budget.realized + budget.forecast
  const ecartH = planned - budget.budget
  const pct = budget.budget > 0 ? Math.min(Math.round((planned / budget.budget) * 100), 999) : null
  const barColor = pct === null ? 'bg-gray-300' : pct > 105 ? 'bg-red-500' : pct >= 90 ? 'bg-amber-400' : 'bg-emerald-500'
  const pctColor = pct === null ? 'text-gray-400' : pct > 105 ? 'text-red-600' : pct >= 90 ? 'text-amber-500' : 'text-emerald-600'
  const ecartColor = ecartH > 0 ? 'text-red-600' : ecartH < 0 ? 'text-emerald-600' : 'text-gray-500'
  const displayedGantt = ganttTeamId ? ganttEntries.filter(e => e.team_id === ganttTeamId) : ganttEntries

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="text-gray-400 text-sm mt-0.5 capitalize">
          {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Effectifs du jour — Gantt */}
      <Card title="Effectifs du jour" badge={`${displayedGantt.length} présent${displayedGantt.length !== 1 ? 's' : ''}`}>
        {ganttTeams.length > 1 && (
          <div className="mb-3">
            <select value={ganttTeamId} onChange={e => setGanttTeamId(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-slate-200">
              <option value="">Toutes les équipes</option>
              {ganttTeams.map(t => <option key={t.id} value={t.id}>{t.name}{t.cdpf ? ` · ${t.cdpf}` : ''}</option>)}
            </select>
          </div>
        )}
        <GanttChart entries={displayedGantt} />
        <div className="mt-3 text-right">
          <a href="/planning" className="text-xs text-blue-600 hover:underline">Voir détails →</a>
        </div>
      </Card>

      {/* Vigilance J+5 */}
      <Card title="Vigilance effectifs" badge="5 prochains jours">
        <div className="grid grid-cols-5 gap-1">
          {vigilance.map(day => {
            const diff = day.theoretical !== null ? day.planned - day.theoretical : null
            return (
              <div key={day.date} className="border border-gray-100 rounded-lg py-1 px-2 text-center">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-none">{day.label}</div>
                <div className="text-[20px] font-bold leading-none mt-0.5 text-gray-900">
                  {day.planned}
                </div>
                {day.theoretical !== null ? (
                  <>
                    <div className={`text-[18px] font-bold leading-none mt-0.5 ${diff! >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {diff! > 0 ? `+${diff}` : diff === 0 ? '=' : `${diff}`}
                    </div>
                    <div className="text-[10px] text-gray-400 leading-none mt-0.5">{day.theoretical} requis</div>
                  </>
                ) : (
                  <div className="text-[9px] text-gray-300 mt-0.5">—</div>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {/* Pilotage budgétaire */}
      <Card title="Pilotage budgétaire" badge={monthLabel}>
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-gray-400">Réalisé <span className="font-semibold text-gray-700">{fmtH(budget.realized)}</span></span>
            <span className="text-xs text-gray-300">+</span>
            <span className="text-xs text-gray-400">Prévu <span className="font-semibold text-gray-700">{fmtH(budget.forecast)}</span></span>
            <span className="text-xs text-gray-300">=</span>
            <span className="text-xs text-gray-400">Total <span className="text-base font-bold text-gray-900">{fmtH(planned)}</span></span>
            {budget.budget > 0 && (
              <>
                <span className="text-xs text-gray-300">/</span>
                <span className="text-xs text-gray-400">Budget <span className="font-semibold text-gray-700">{fmtH(budget.budget)}</span></span>
                {pct !== null && <span className={`text-lg font-bold tabular-nums ${pctColor}`}>{pct}%</span>}
                {ecartH !== 0 && <span className={`text-xs font-semibold ${ecartColor}`}>{ecartH > 0 ? '+' : ''}{fmtH(ecartH)} {ecartH > 0 ? 'dépassement' : 'économie'}</span>}
              </>
            )}
          </div>
          {budget.budget > 0 ? (
            <div className="mt-2 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(pct!, 100)}%` }} />
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic mt-1">Aucune structure configurée dans le calendrier annuel pour ce mois.</p>
          )}
        </div>
      </Card>

      {/* Stats rapides */}
      <div className="grid grid-cols-2 gap-3">
        <QuickStat label="Équipes" value={teamCount} />
        <QuickStat label="Salariés dans les équipes" value={employeeCount} />
      </div>

      {/* Contacts utiles */}
      {contacts.length > 0 && (
        <Card title="Contacts utiles">
          <div className="space-y-2">
            {contacts.map(c => (
              <div key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                <span className="font-semibold text-gray-800">{c.role_label}</span>
                {c.contact_name && <span className="text-gray-600">{c.contact_name}</span>}
                {c.phone && <a href={`tel:${c.phone}`} className="text-blue-600 hover:underline">{c.phone}</a>}
                {c.email && <a href={`mailto:${c.email}`} className="text-blue-600 hover:underline text-xs">{c.email}</a>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function Card({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
        {badge && <span className="text-xs text-gray-400">{badge}</span>}
      </div>
      {children}
    </div>
  )
}

function GanttChart({ entries }: { entries: GanttEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-xs text-gray-400 italic">Aucun salarié planifié aujourd'hui.</p>
  }
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const allMins = entries.flatMap(e => [toMin(e.start), toMin(e.end)])
  const minH = Math.min(...allMins)
  const maxH = Math.max(...allMins)
  const span = maxH - minH || 1
  return (
    <div className="space-y-0.5">
      {entries.map(e => {
        const s = toMin(e.start), en = toMin(e.end)
        const left = ((s - minH) / span) * 100
        const width = Math.max(((en - s) / span) * 100, 2)
        const color = getCodeColor(e.code)
        return (
          <div key={e.employee_id} className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 w-24 shrink-0 truncate">{e.name}</span>
            <div className="flex-1 relative h-4 bg-gray-100 rounded">
              <div
                className="absolute top-0.5 bottom-0.5 rounded flex items-center px-1"
                style={{ left: `${left}%`, width: `${width}%`, background: color.bg }}
              >
                <span className="text-[8px] font-medium whitespace-nowrap overflow-hidden leading-none" style={{ color: color.text }}>
                  {e.code in CADRE_INDICATIVE_DASH ? e.code : `${e.code} ${e.start}–${e.end}`}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BudgetStat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs text-gray-400 mb-0.5">{label}</div>
      <div className={`tabular-nums ${accent ? 'text-xl font-bold text-gray-900' : 'text-lg font-semibold text-gray-600'}`}>
        {(() => {
          const abs = Math.abs(value)
          const hours = Math.floor(abs)
          const mins = Math.round((abs - hours) * 60)
          return mins === 0 ? `${hours}h` : `${hours}h${String(mins).padStart(2, '0')}`
        })()}
      </div>
    </div>
  )
}

function QuickStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl px-5 py-4 flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-2xl font-bold text-gray-900 tabular-nums">{value}</span>
    </div>
  )
}

function SkeletonDashboard() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5 animate-pulse">
      <div>
        <div className="h-6 bg-gray-200 rounded w-44 mb-1" />
        <div className="h-3.5 bg-gray-100 rounded w-64" />
      </div>
      {[80, 110, 90].map((h, i) => (
        <div key={i} className="bg-white border border-gray-100 rounded-xl p-5">
          <div className="h-4 bg-gray-200 rounded w-36 mb-4" />
          <div className="bg-gray-100 rounded-lg" style={{ height: h }} />
        </div>
      ))}
      <div className="grid grid-cols-2 gap-3">
        {[0,1].map(i => <div key={i} className="bg-white border border-gray-100 rounded-xl h-16" />)}
      </div>
    </div>
  )
}
