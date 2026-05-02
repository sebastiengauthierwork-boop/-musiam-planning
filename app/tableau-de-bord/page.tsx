'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSite } from '@/lib/site-context'

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

type EffectifsJour = { matin: number; aprem: number; soir: number }
type DayVigilance = { date: string; label: string; planned: number; theoretical: number | null }
type BudgetData = { realized: number; forecast: number; budget: number }

export default function TableauDeBord() {
  const { selectedSiteId } = useSite()
  const now = new Date()
  const todayStr = toISO(now)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [effectifs, setEffectifs] = useState<EffectifsJour>({ matin: 0, aprem: 0, soir: 0 })
  const [vigilance, setVigilance] = useState<DayVigilance[]>([])
  const [budget, setBudget] = useState<BudgetData>({ realized: 0, forecast: 0, budget: 0 })
  const [teamCount, setTeamCount] = useState(0)
  const [employeeCount, setEmployeeCount] = useState(0)

  useEffect(() => { load() }, [selectedSiteId])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      // 1. Teams
      let teamsQ = supabase.from('teams').select('id')
      if (selectedSiteId) teamsQ = teamsQ.eq('site_id', selectedSiteId)
      const teamsRes = await teamsQ
      if (teamsRes.error) throw teamsRes.error

      const teams = teamsRes.data ?? []
      const teamIds = teams.map((t: any) => t.id)
      setTeamCount(teams.length)

      if (!teamIds.length) { setLoading(false); return }

      // 2. Shift codes map (code → paid_hours)
      const { data: scData } = await supabase.from('shift_codes').select('code, paid_hours')
      const scMap: Record<string, number> = {}
      for (const sc of scData ?? []) {
        if (sc.code && !(sc.code in scMap)) scMap[sc.code] = Number(sc.paid_hours ?? 0)
      }

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
          .select('employee_id, start_time')
          .in('team_id', teamIds).eq('date', todayStr).eq('type', 'shift'),
        supabase.from('schedules')
          .select('date, employee_id')
          .in('team_id', teamIds).in('date', next5Strs).eq('type', 'shift'),
        supabase.from('schedules')
          .select('date, code')
          .in('team_id', teamIds).gte('date', firstOfMonth).lte('date', lastOfMonth).eq('type', 'shift'),
        supabase.from('annual_calendar')
          .select('date, structure_id')
          .in('team_id', teamIds).gte('date', firstOfMonth).lte('date', lastOfMonth),
        supabase.from('employee_teams')
          .select('employee_id', { count: 'exact', head: true })
          .in('team_id', teamIds),
      ])

      setEmployeeCount(empRes.count ?? 0)

      // 6. Effectifs du jour — par tranche horaire
      const buckets = { matin: new Set<string>(), aprem: new Set<string>(), soir: new Set<string>() }
      for (const s of todayRes.data ?? []) {
        if (!s.start_time) continue
        const h = parseInt(s.start_time.split(':')[0], 10)
        if (h < 12) buckets.matin.add(s.employee_id)
        else if (h < 18) buckets.aprem.add(s.employee_id)
        else buckets.soir.add(s.employee_id)
      }
      setEffectifs({ matin: buckets.matin.size, aprem: buckets.aprem.size, soir: buckets.soir.size })

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

      // 8. Vigilance J+5
      const plannedByDay: Record<string, Set<string>> = {}
      for (const s of next5Res.data ?? []) {
        if (!plannedByDay[s.date]) plannedByDay[s.date] = new Set()
        plannedByDay[s.date].add(s.employee_id)
      }

      const theoreticalByDate: Record<string, number | null> = {}
      for (const ds of next5Strs) {
        const entries = (calRes.data ?? []).filter((c: any) => c.date === ds && c.structure_id)
        if (!entries.length) { theoreticalByDate[ds] = null; continue }
        theoreticalByDate[ds] = entries.reduce((s: number, c: any) => s + (structureReq[c.structure_id] ?? 0), 0)
      }

      setVigilance(next5.map(d => {
        const ds = toISO(d)
        return { date: ds, label: `${DAYS_SHORT[d.getDay()]} ${d.getDate()}`, planned: plannedByDay[ds]?.size ?? 0, theoretical: theoreticalByDate[ds] ?? null }
      }))

      // 9. Budget structure — somme paid_hours × effectif_requis pour chaque jour du mois
      let structBudget = 0
      for (const c of calRes.data ?? []) {
        if (c.structure_id) structBudget += structHoursMap[c.structure_id] ?? 0
      }

      // 10. Heures planifiées (schedules du mois)
      let realized = 0, forecast = 0
      for (const s of monthRes.data ?? []) {
        const h = scMap[s.code] ?? 0
        if (s.date <= todayStr) realized += h
        else forecast += h
      }
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

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="text-gray-400 text-sm mt-0.5 capitalize">
          {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Effectifs du jour */}
      <Card title="Effectifs du jour" badge={`${effectifs.matin + effectifs.aprem + effectifs.soir} présents`}>
        <div className="flex gap-3">
          <Pill label="Matin"      sublabel="avant 12h"  count={effectifs.matin} colorClass="bg-blue-50 border-blue-100 text-blue-700" />
          <Pill label="Après-midi" sublabel="12h – 18h"  count={effectifs.aprem} colorClass="bg-amber-50 border-amber-100 text-amber-700" />
          <Pill label="Soir"       sublabel="après 18h"  count={effectifs.soir}  colorClass="bg-violet-50 border-violet-100 text-violet-700" />
        </div>
      </Card>

      {/* Vigilance J+5 */}
      <Card title="Vigilance effectifs" badge="5 prochains jours">
        <div className="grid grid-cols-5 gap-2">
          {vigilance.map(day => {
            const diff = day.theoretical !== null ? day.planned - day.theoretical : null
            return (
              <div key={day.date} className="border border-gray-100 rounded-xl p-3 text-center">
                <div className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">{day.label}</div>
                <div className={`text-2xl font-bold ${diff !== null && diff < -1 ? 'text-red-600' : 'text-gray-900'}`}>
                  {day.planned}
                </div>
                {day.theoretical !== null ? (
                  <>
                    <div className="text-xs text-gray-400 mt-0.5">{day.theoretical} requis</div>
                    <div className={`text-xs font-bold mt-1 ${diff! >= 0 ? 'text-emerald-600' : diff! >= -1 ? 'text-amber-500' : 'text-red-600'}`}>
                      {diff! > 0 ? `+${diff}` : diff === 0 ? '=' : `${diff}`}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-gray-300 mt-0.5">— requis</div>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {/* Pilotage budgétaire */}
      <Card title="Pilotage budgétaire" badge={monthLabel}>
        <div className="space-y-4">
          <div className="flex items-end gap-8 flex-wrap">
            <BudgetStat label="Réalisé" value={budget.realized} />
            <BudgetStat label="Prévisionnel" value={budget.forecast} />
            <div className="h-8 w-px bg-gray-100" />
            <BudgetStat label="Total planifié" value={planned} accent />
            {budget.budget > 0 && <BudgetStat label="Budget structure" value={budget.budget} />}
            {pct !== null && (
              <span className={`ml-auto text-3xl font-bold tabular-nums ${pctColor}`}>
                {pct}%
              </span>
            )}
          </div>

          {budget.budget > 0 ? (
            <>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor}`}
                  style={{ width: `${Math.min(pct!, 100)}%` }}
                />
              </div>
              <div className={`text-sm font-semibold ${ecartColor}`}>
                Écart : {ecartH > 0 ? '+' : ''}{fmtH(ecartH)}
                <span className="font-normal text-xs ml-1.5 opacity-70">
                  {ecartH > 0 ? 'dépassement' : ecartH < 0 ? 'économie' : 'équilibré'}
                </span>
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-400 italic">
              Aucune structure configurée dans le calendrier annuel pour ce mois.
            </p>
          )}
        </div>
      </Card>

      {/* Stats rapides */}
      <div className="grid grid-cols-2 gap-3">
        <QuickStat label="Équipes" value={teamCount} />
        <QuickStat label="Salariés dans les équipes" value={employeeCount} />
      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function Card({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5">
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
        {badge && <span className="text-xs text-gray-400">{badge}</span>}
      </div>
      {children}
    </div>
  )
}

function Pill({ label, sublabel, count, colorClass }: { label: string; sublabel: string; count: number; colorClass: string }) {
  return (
    <div className={`border rounded-xl px-5 py-3 flex flex-col items-center min-w-[110px] ${colorClass}`}>
      <span className="text-3xl font-bold tabular-nums">{count}</span>
      <span className="text-xs font-semibold mt-1">{label}</span>
      <span className="text-xs opacity-60">{sublabel}</span>
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
