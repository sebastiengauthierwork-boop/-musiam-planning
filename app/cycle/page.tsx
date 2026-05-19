'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState, Fragment } from 'react'
import { supabase } from '@/lib/supabase'
import { teamLabel } from '@/lib/teamUtils'
import { getCodeColors, SHIFT_PALETTE, REPOS_COLOR, ABSENCE_COLOR } from '@/lib/codeColors'
import { sortEmployees, isTemporaire } from '@/lib/employeeUtils'

type Team = { id: string; name: string; cdpf: string | null; cycle_weeks: number | null; site_id: string | null }
type Employee = { id: string; first_name: string; last_name: string; fonction: string | null; contract_type: string | null; statut: string | null }
type ShiftCode = { id: string; code: string; label: string; start_time: string | null; end_time: string | null; net_hours: number | null }
type AbsenceCode = { id: string; code: string; label: string; is_paid: boolean }
type AllCode = { code: string; label: string; kind: 'shift' | 'absence'; start_time?: string | null; end_time?: string | null }

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const DAY_LABELS = ['L', 'Ma', 'Me', 'J', 'V', 'S', 'D']

function CycleCell({ code, shiftCodes, absenceCodes, onSave }: {
  code: string
  shiftCodes: ShiftCode[]
  absenceCodes: AbsenceCode[]
  onSave: (code: string) => void
}) {
  const [val, setVal] = useState(code)
  const [open, setOpen] = useState(false)
  useEffect(() => { setVal(code) }, [code])

  const allCodes: AllCode[] = [
    ...shiftCodes.map(c => ({ code: c.code, label: c.label, kind: 'shift' as const, start_time: c.start_time, end_time: c.end_time })),
    ...absenceCodes.map(c => ({ code: c.code, label: c.label, kind: 'absence' as const })),
  ]
  const allValidCodes = new Set([...shiftCodes.map(c => c.code), ...absenceCodes.map(c => c.code)])
  const suggestions = allCodes.filter(c => val.length === 0 || c.code.startsWith(val.toUpperCase()))

  function commit(v: string) {
    const upper = v.trim().toUpperCase()
    if (upper === '' || allValidCodes.has(upper)) { setVal(upper); onSave(upper) }
    else setVal(code)
    setOpen(false)
  }

  const colors = val ? getCodeColors(val, shiftCodes, absenceCodes) : null
  const bgStyle = colors ? { background: colors.bg, color: colors.text } : {}

  return (
    <div className="relative w-full h-full" style={bgStyle}>
      <input
        value={val}
        onChange={e => { setVal(e.target.value.toUpperCase()); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setTimeout(() => setOpen(false), 130); commit(val) }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commit(val) }
          if (e.key === 'Escape') { setVal(code); setOpen(false) }
        }}
        className="w-full h-7 text-center text-xs font-mono bg-transparent focus:outline-none uppercase"
        maxLength={5}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg min-w-[260px] max-h-[300px] overflow-y-auto">
          {suggestions.some(c => c.kind === 'shift') && (
            <>
              <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100 sticky top-0">Codes horaires</div>
              {suggestions.filter(c => c.kind === 'shift').map(c => (
                <button key={c.code} onMouseDown={e => { e.preventDefault(); setVal(c.code); onSave(c.code); setOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-blue-50 text-left">
                  <span className="font-mono font-bold w-10 shrink-0 text-blue-600">{c.code}</span>
                  <span className="text-gray-500 truncate flex-1">{c.label}</span>
                  {c.start_time && <span className="text-gray-400 shrink-0">{c.start_time.slice(0, 5)}–{c.end_time?.slice(0, 5)}</span>}
                </button>
              ))}
            </>
          )}
          {suggestions.some(c => c.kind === 'absence') && (
            <>
              <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100 sticky top-0">Absences</div>
              {suggestions.filter(c => c.kind === 'absence').map(c => (
                <button key={c.code} onMouseDown={e => { e.preventDefault(); setVal(c.code); onSave(c.code); setOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-blue-50 text-left">
                  <span className="font-mono font-bold w-10 shrink-0 text-gray-500">{c.code}</span>
                  <span className="text-gray-500 truncate flex-1">{c.label}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function CyclePage() {
  const now = new Date()
  const [teams, setTeams] = useState<Team[]>([])
  const [teamId, setTeamId] = useState('')
  const [allPermanents, setAllPermanents] = useState<Employee[]>([])
  const [cycleEmployees, setCycleEmployees] = useState<Employee[]>([])
  const [shiftCodes, setShiftCodes] = useState<ShiftCode[]>([])
  const [absenceCodes, setAbsenceCodes] = useState<AbsenceCode[]>([])
  const [entries, setEntries] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Manage employees modal
  const [manageModal, setManageModal] = useState(false)
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null)
  const [removeLoading, setRemoveLoading] = useState(false)

  // Load teams + absence codes once
  useEffect(() => {
    Promise.all([
      supabase.from('teams').select('id, name, cdpf, cycle_weeks, site_id').order('name'),
      supabase.from('absence_codes').select('id, code, label, is_paid, color').order('code'),
    ]).then(([tRes, acRes]) => {
      const t = tRes.data ?? []
      setTeams(t)
      if (t.length > 0) setTeamId(t[0].id)
      setAbsenceCodes(acRes.data ?? [])
    })
  }, [])

  const loadTeamData = useCallback(async () => {
    if (!teamId) return
    setLoading(true)
    try {
      // Load shift codes filtered by this team's site
      const team = teams.find(t => t.id === teamId)
      if (team?.site_id) {
        const { data: scData } = await supabase
          .from('shift_codes')
          .select('id, code, label, start_time, end_time, net_hours, color')
          .eq('site_id', team.site_id)
          .order('code')
        setShiftCodes(scData ?? [])
      } else {
        setShiftCodes([])
      }

      // Load all active CDI/CDD team members (no INTERIM/EXTRA)
      const { data: etData } = await supabase
        .from('employee_teams')
        .select('employee_id, employees(id, first_name, last_name, fonction, is_active, contract_type, statut)')
        .eq('team_id', teamId)
        .eq('is_primary', true)

      const empList: Employee[] = []
      const seen = new Set<string>()
      for (const et of (etData ?? []) as any[]) {
        const e = et.employees
        if (!e || !e.is_active || seen.has(e.id) || isTemporaire(e.contract_type)) continue
        seen.add(e.id)
        empList.push({ id: e.id, first_name: e.first_name, last_name: e.last_name, fonction: e.fonction ?? null, contract_type: e.contract_type ?? null, statut: e.statut ?? null })
      }
      const { permanents } = sortEmployees(empList)
      setAllPermanents(permanents)

      // Load cycle entries — only employees with entries appear in the grid
      if (permanents.length > 0) {
        const { data: cycleData, error } = await supabase
          .from('cycle_schedules')
          .select('employee_id, week_number, day_of_week, code')
          .eq('team_id', teamId)
          .in('employee_id', permanents.map(e => e.id))

        if (error) throw error

        const map: Record<string, string> = {}
        const cycleEmpIds = new Set<string>()
        for (const row of (cycleData ?? [])) {
          map[`${row.employee_id}|${row.week_number}|${row.day_of_week}`] = row.code
          cycleEmpIds.add(row.employee_id)
        }
        setEntries(map)
        setCycleEmployees(permanents.filter(e => cycleEmpIds.has(e.id)))
      } else {
        setEntries({})
        setCycleEmployees([])
      }
    } finally {
      setLoading(false)
    }
  }, [teamId, teams])

  useEffect(() => { loadTeamData() }, [loadTeamData])

  function addToCycle(emp: Employee) {
    setCycleEmployees(prev => {
      if (prev.find(e => e.id === emp.id)) return prev
      const allIds = allPermanents.map(e => e.id)
      return [...prev, emp].sort((a, b) => allIds.indexOf(a.id) - allIds.indexOf(b.id))
    })
  }

  async function removeFromCycle(empId: string) {
    setRemoveLoading(true)
    await supabase.from('cycle_schedules')
      .delete()
      .eq('employee_id', empId)
      .eq('team_id', teamId)
    setCycleEmployees(prev => prev.filter(e => e.id !== empId))
    setEntries(prev => {
      const n = { ...prev }
      Object.keys(n).filter(k => k.startsWith(empId + '|')).forEach(k => delete n[k])
      return n
    })
    setRemoveConfirmId(null)
    setRemoveLoading(false)
  }

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

  const cycleIds = new Set(cycleEmployees.map(e => e.id))
  const available = allPermanents.filter(e => !cycleIds.has(e.id))
  const currentTeam = teams.find(t => t.id === teamId)
  const cycleWeeks = (currentTeam?.cycle_weeks ?? 6) || 6
  const weeks = Array.from({ length: cycleWeeks }, (_, i) => i + 1)

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <h1 className="text-lg font-bold text-gray-900 mr-2">Cycles / Rotations</h1>
        <select value={teamId} onChange={e => setTeamId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-200">
          {teams.map(t => <option key={t.id} value={t.id}>{teamLabel(t)}</option>)}
        </select>
        <button
          onClick={() => { setRemoveConfirmId(null); setManageModal(true) }}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Gérer les salariés du cycle
        </button>
        {saving && <span className="text-xs text-blue-400 animate-pulse">Sauvegarde…</span>}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-400">S1–S{cycleWeeks} = semaines du cycle · L=lundi … D=dimanche</span>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">Chargement…</div>
        ) : cycleEmployees.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-gray-400 text-sm">Aucun salarié dans ce cycle.</p>
            <button
              onClick={() => { setRemoveConfirmId(null); setManageModal(true) }}
              className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              Gérer les salariés du cycle
            </button>
          </div>
        ) : (
          <table className="border-collapse text-xs w-max min-w-full">
            <thead className="sticky top-0 z-20 bg-white">
              <tr>
                <th className="sticky left-0 z-30 bg-white border-b border-r border-gray-200 w-44 min-w-[176px] px-3 py-2 text-left text-gray-500 font-semibold text-xs uppercase tracking-wider">
                  Salarié
                </th>
                {weeks.map(w =>
                  DAY_LABELS.map((d, di) => {
                    const isWE = di >= 5
                    return (
                      <th key={`${w}-${di}`}
                        className="w-10 min-w-[38px] border-b border-r border-gray-200 py-1.5 text-center">
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
              {cycleEmployees.map((emp) => (
                <tr key={emp.id} className="group hover:bg-blue-50/20">
                  <td className="sticky left-0 z-10 bg-white group-hover:bg-blue-50/20 border-b border-r border-gray-100 px-3 py-0 h-7 whitespace-nowrap">
                    <span className="font-semibold text-gray-800">{emp.last_name}</span>{' '}
                    <span className="text-gray-500">{emp.first_name}</span>
                    {emp.fonction && <span className="ml-1.5 text-gray-400 text-[10px]">· {emp.fonction}</span>}
                  </td>
                  {weeks.map(w =>
                    DAY_LABELS.map((_, di) => {
                      const dayOfWeek = di + 1
                      const key = `${emp.id}|${w}|${dayOfWeek}`
                      const code = entries[key] ?? ''
                      const isWE = di >= 5
                      return (
                        <td key={`${w}-${di}`} className={`border-b border-r border-gray-100 p-0 h-7 relative${isWE ? ' bg-gray-50/30' : ''}`}>
                          <CycleCell
                            code={code}
                            shiftCodes={shiftCodes}
                            absenceCodes={absenceCodes}
                            onSave={v => saveEntry(emp.id, w, dayOfWeek, v)}
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

      {/* Manage employees modal */}
      {manageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !removeLoading && setManageModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <h2 className="text-base font-semibold text-gray-900">Gérer les salariés du cycle</h2>
              <button onClick={() => setManageModal(false)} disabled={removeLoading}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 flex-1 overflow-hidden">
              {/* Left: in cycle */}
              <div className="flex flex-col overflow-hidden">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 shrink-0">
                  Dans le cycle ({cycleEmployees.length})
                </div>
                <div className="flex-1 overflow-y-auto space-y-1">
                  {cycleEmployees.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Aucun salarié</p>
                  ) : cycleEmployees.map(emp => (
                    <div key={emp.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 group">
                      <span className="text-sm text-gray-800 truncate">
                        <span className="font-medium">{emp.last_name}</span> {emp.first_name}
                      </span>
                      {removeConfirmId === emp.id ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs text-red-600 font-medium">Supprimer ?</span>
                          <button
                            onClick={() => removeFromCycle(emp.id)}
                            disabled={removeLoading}
                            className="text-xs px-2 py-0.5 bg-red-600 text-white rounded font-semibold hover:bg-red-700 disabled:opacity-50"
                          >
                            Oui
                          </button>
                          <button
                            onClick={() => setRemoveConfirmId(null)}
                            disabled={removeLoading}
                            className="text-xs px-2 py-0.5 border border-gray-300 text-gray-700 rounded font-semibold hover:bg-gray-100 disabled:opacity-50"
                          >
                            Non
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setRemoveConfirmId(emp.id)}
                          className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                          title="Retirer du cycle"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: available */}
              <div className="flex flex-col overflow-hidden border-l border-gray-100 pl-4">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 shrink-0">
                  À ajouter ({available.length})
                </div>
                <div className="flex-1 overflow-y-auto space-y-1">
                  {available.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Tous les salariés CDI/CDD sont déjà dans le cycle.</p>
                  ) : available.map(emp => (
                    <div key={emp.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 group">
                      <span className="text-sm text-gray-800 truncate">
                        <span className="font-medium">{emp.last_name}</span> {emp.first_name}
                      </span>
                      <button
                        onClick={() => addToCycle(emp)}
                        className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:bg-green-50 hover:text-green-600 transition-colors"
                        title="Ajouter au cycle"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 shrink-0 text-right">
              <button onClick={() => setManageModal(false)}
                className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
