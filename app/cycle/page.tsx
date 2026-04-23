'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { teamLabel } from '@/lib/teamUtils'
import { getCodeColors, SHIFT_PALETTE, REPOS_COLOR, ABSENCE_COLOR } from '@/lib/codeColors'

type Team = { id: string; name: string; cdpf: string | null }
type Employee = { id: string; first_name: string; last_name: string; fonction: string | null }
type ShiftCode = { id: string; code: string; label: string; start_time: string | null; end_time: string | null; net_hours: number | null }
type AbsenceCode = { id: string; code: string; label: string; is_paid: boolean }

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const DAY_LABELS = ['L', 'Ma', 'Me', 'J', 'V', 'S', 'D']
const WEEKS = [1, 2, 3, 4, 5, 6] as const


export default function CyclePage() {
  const now = new Date()
  const [teams, setTeams] = useState<Team[]>([])
  const [teamId, setTeamId] = useState('')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [shiftCodes, setShiftCodes] = useState<ShiftCode[]>([])
  const [absenceCodes, setAbsenceCodes] = useState<AbsenceCode[]>([])
  const [entries, setEntries] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [applyModal, setApplyModal] = useState(false)
  const [applyYear, setApplyYear] = useState(now.getFullYear())
  const [applyMonth, setApplyMonth] = useState(now.getMonth())
  const [applyLoading, setApplyLoading] = useState(false)
  const [applyResult, setApplyResult] = useState<string | null>(null)

  // Load teams + codes once
  useEffect(() => {
    Promise.all([
      supabase.from('teams').select('id, name, cdpf').order('name'),
      supabase.from('shift_codes').select('id, code, label, start_time, end_time, net_hours').order('code'),
      supabase.from('absence_codes').select('id, code, label, is_paid').order('code'),
    ]).then(([tRes, scRes, acRes]) => {
      const t = tRes.data ?? []
      setTeams(t)
      if (t.length > 0) setTeamId(t[0].id)
      setShiftCodes(scRes.data ?? [])
      setAbsenceCodes(acRes.data ?? [])
    })
  }, [])

  const loadTeamData = useCallback(async () => {
    if (!teamId) return
    setLoading(true)
    try {
      // Load employees
      const { data: etData } = await supabase
        .from('employee_teams')
        .select('employee_id, employees(id, first_name, last_name, fonction, is_active)')
        .eq('team_id', teamId)
        .eq('is_primary', true)

      const empList: Employee[] = []
      const seen = new Set<string>()
      for (const et of (etData ?? []) as any[]) {
        const e = et.employees
        if (!e || !e.is_active || seen.has(e.id)) continue
        seen.add(e.id)
        empList.push({ id: e.id, first_name: e.first_name, last_name: e.last_name, fonction: e.fonction ?? null })
      }
      empList.sort((a, b) => a.last_name.localeCompare(b.last_name))
      setEmployees(empList)

      // Load cycle entries from cycle_schedules
      if (empList.length > 0) {
        const { data: cycleData, error } = await supabase
          .from('cycle_schedules')
          .select('employee_id, week_number, day_of_week, code')
          .eq('team_id', teamId)
          .in('employee_id', empList.map(e => e.id))

        if (error) throw error

        const map: Record<string, string> = {}
        for (const row of (cycleData ?? [])) {
          map[`${row.employee_id}|${row.week_number}|${row.day_of_week}`] = row.code
        }
        setEntries(map)
      } else {
        setEntries({})
      }
    } finally {
      setLoading(false)
    }
  }, [teamId])

  useEffect(() => { loadTeamData() }, [loadTeamData])

  async function saveEntry(empId: string, weekNum: number, dayOfWeek: number, code: string) {
    const key = `${empId}|${weekNum}|${dayOfWeek}`
    setEntries(prev => {
      const next = { ...prev }
      if (code) next[key] = code; else delete next[key]
      return next
    })
    setSaving(true)
    try {
      if (!code) {
        await supabase.from('cycle_schedules')
          .delete()
          .eq('employee_id', empId)
          .eq('team_id', teamId)
          .eq('week_number', weekNum)
          .eq('day_of_week', dayOfWeek)
      } else {
        await supabase.from('cycle_schedules').upsert({
          employee_id: empId,
          team_id: teamId,
          week_number: weekNum,
          day_of_week: dayOfWeek,
          code,
        }, { onConflict: 'employee_id,team_id,week_number,day_of_week' })
      }
    } finally {
      setSaving(false)
    }
  }

  async function applyToMonth() {
    if (employees.length === 0) return
    setApplyLoading(true)
    setApplyResult(null)
    try {
      const nDays = new Date(applyYear, applyMonth + 1, 0).getDate()
      const days: Date[] = Array.from({ length: nDays }, (_, i) => new Date(applyYear, applyMonth, i + 1))

      // Map each calendar week (Mon–Sun) to a week index within the month
      const weekKeyOrder: string[] = []
      const weekKeyMap = new Map<string, number>()
      for (const d of days) {
        const dow = (d.getDay() + 6) % 7
        const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow)
        const key = `${mon.getFullYear()}-${mon.getMonth()}-${mon.getDate()}`
        if (!weekKeyMap.has(key)) { weekKeyMap.set(key, weekKeyOrder.length); weekKeyOrder.push(key) }
      }

      const upserts: any[] = []
      for (const emp of employees) {
        for (const d of days) {
          const dow = (d.getDay() + 6) % 7
          const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow)
          const key = `${mon.getFullYear()}-${mon.getMonth()}-${mon.getDate()}`
          const wIdx = weekKeyMap.get(key) ?? 0
          const cycleWeek = (wIdx % 6) + 1  // 1–6
          const dayOfWeek = dow + 1           // 1=Mon, 7=Sun
          const code = entries[`${emp.id}|${cycleWeek}|${dayOfWeek}`]
          if (!code) continue

          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          const sc = shiftCodes.find(c => c.code === code)
          upserts.push({
            employee_id: emp.id,
            team_id: teamId,
            date: dateStr,
            code,
            type: sc ? 'shift' : 'absence',
            start_time: sc?.start_time ?? null,
            end_time: sc?.end_time ?? null,
            break_minutes: 0,
            status: 'brouillon',
            notes: null,
          })
        }
      }

      if (upserts.length > 0) {
        const { error } = await supabase.from('schedules').upsert(upserts, { onConflict: 'employee_id,date' })
        if (error) throw error
      }

      setApplyResult(`✓ ${upserts.length} créneau${upserts.length !== 1 ? 'x' : ''} appliqué${upserts.length !== 1 ? 's' : ''} sur ${MONTHS[applyMonth]} ${applyYear}`)
      setTimeout(() => { setApplyModal(false); setApplyResult(null) }, 2500)
    } catch (e: any) {
      setApplyResult(`Erreur : ${e?.message ?? JSON.stringify(e)}`)
    } finally {
      setApplyLoading(false)
    }
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 1 + i)

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <h1 className="text-lg font-bold text-gray-900 mr-2">Cycles / Rotations</h1>
        <select value={teamId} onChange={e => setTeamId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-200">
          {teams.map(t => <option key={t.id} value={t.id}>{teamLabel(t)}</option>)}
        </select>
        {saving && <span className="text-xs text-blue-400 animate-pulse">Sauvegarde…</span>}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-400">S1–S6 = semaines du cycle · L=lundi … D=dimanche</span>
          <button
            onClick={() => setApplyModal(true)}
            disabled={employees.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-40"
          >
            Appliquer au mois
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">Chargement…</div>
        ) : employees.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Aucun salarié actif pour cette équipe.
          </div>
        ) : (
          <table className="border-collapse text-xs w-max min-w-full">
            <thead className="sticky top-0 z-20 bg-white">
              <tr>
                <th className="sticky left-0 z-30 bg-white border-b border-r border-gray-200 w-44 min-w-[176px] px-3 py-2 text-left text-gray-500 font-semibold text-xs uppercase tracking-wider">
                  Salarié
                </th>
                {WEEKS.map(w =>
                  DAY_LABELS.map((d, di) => {
                    const isWE = di >= 5
                    return (
                      <th key={`${w}-${di}`}
                        className={`w-10 min-w-[38px] border-b border-r border-gray-200 py-1.5 text-center ${isWE ? 'bg-slate-50' : ''}`}>
                        {di === 0
                          ? <div className="text-[9px] font-bold text-indigo-500 leading-none mb-0.5">S{w}</div>
                          : <div className="leading-none mb-0.5 invisible text-[9px]">·</div>
                        }
                        <div className={`text-[10px] ${isWE ? 'text-slate-400' : 'text-gray-500'}`}>{d}</div>
                      </th>
                    )
                  })
                )}
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.id} className="group hover:bg-blue-50/20">
                  <td className="sticky left-0 z-10 bg-white group-hover:bg-blue-50/20 border-b border-r border-gray-100 px-3 py-0 h-7 whitespace-nowrap">
                    <span className="font-semibold text-gray-800">{emp.last_name}</span>{' '}
                    <span className="text-gray-500">{emp.first_name}</span>
                    {emp.fonction && <span className="ml-1.5 text-gray-400 text-[10px]">· {emp.fonction}</span>}
                  </td>
                  {WEEKS.map(w =>
                    DAY_LABELS.map((_, di) => {
                      const dayOfWeek = di + 1
                      const key = `${emp.id}|${w}|${dayOfWeek}`
                      const code = entries[key] ?? ''
                      const isWE = di >= 5
                      const c = !isWE && code ? getCodeColors(code, shiftCodes, absenceCodes) : null
                      const bgStyle = c ? { background: c.bg, color: c.text } : isWE ? { background: '#f1f5f9' } : {}
                      return (
                        <td key={`${w}-${di}`} className="border-b border-r border-gray-100 p-0 h-7 relative" style={bgStyle}>
                          <input
                            value={code}
                            onChange={e => {
                              const v = e.target.value.trim().toUpperCase()
                              setEntries(prev => { const n = { ...prev }; if (v) n[key] = v; else delete n[key]; return n })
                            }}
                            onBlur={e => saveEntry(emp.id, w, dayOfWeek, e.target.value.trim().toUpperCase())}
                            className="w-full h-7 text-center text-xs font-mono bg-transparent focus:outline-none uppercase"
                            maxLength={5}
                          />
                        </td>
                      )
                    })
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Legend */}
      <div className="shrink-0 flex items-center gap-5 px-4 py-2 border-t border-gray-100 bg-white text-xs text-gray-400">
        <span className="inline-flex items-center gap-1">
          {SHIFT_PALETTE.slice(0, 4).map(c => (
            <span key={c.bg} className="w-3 h-3 rounded" style={{ background: c.bg, border: '1px solid #cbd5e1' }} />
          ))}
          <span className="ml-1">Codes horaires</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ background: REPOS_COLOR.bg }} />
          Repos
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ background: ABSENCE_COLOR.bg }} />
          Absences
        </span>
      </div>

      {/* Apply modal */}
      {applyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !applyLoading && setApplyModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Appliquer le cycle au mois</h2>
            <p className="text-xs text-gray-400 mb-4">
              S1 du cycle = 1re semaine du mois, puis rotation S1→S6.
            </p>
            <div className="flex gap-3 mb-4">
              <select value={applyMonth} onChange={e => setApplyMonth(Number(e.target.value))}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200">
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select value={applyYear} onChange={e => setApplyYear(Number(e.target.value))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <p className="text-sm text-gray-500 mb-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Les cellules déjà remplies dans le planning seront <strong>écrasées</strong>.
            </p>
            {applyResult && (
              <div className={`mb-4 rounded-lg px-3 py-2 text-sm font-medium ${applyResult.startsWith('Erreur') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                {applyResult}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => setApplyModal(false)} disabled={applyLoading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                Annuler
              </button>
              <button onClick={applyToMonth} disabled={applyLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50">
                {applyLoading ? 'Application…' : 'Confirmer et appliquer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
