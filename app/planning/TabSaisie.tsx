'use client'

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { AbsenceCode, Employee, ShiftCode, TabProps } from './types'
import { decimalToHMin } from '@/lib/timeUtils'
import { generatePlanningPdf } from '@/lib/generatePlanningPdf'
import { getCodeColors, SHIFT_PALETTE, REPOS_COLOR, ABSENCE_COLOR } from '@/lib/codeColors'
import { isTemporaire, getFnCode } from '@/lib/employeeUtils'
import { usePermissions } from '@/lib/permissions'
import { useAuth } from '@/lib/auth'
import { isAdmin } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISO(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function getDays(year: number, month: number): Date[] {
  const n = new Date(year, month + 1, 0).getDate()
  return Array.from({ length: n }, (_, i) => new Date(year, month, i + 1))
}
function isDateBlocked(emp: Employee, dateStr: string): boolean {
  if (emp.start_date && dateStr < emp.start_date) return true
  if (emp.end_date && dateStr > emp.end_date) return true
  return false
}

function getPaidHours(code: string | null | undefined, shiftCodes: ShiftCode[], teamId: string): number {
  if (!code) return 0
  const sc = shiftCodes.find(c => c.code === code && (c.team_id === teamId || c.team_id === null))
  return Number(sc?.paid_hours ?? 0)
}
function fmtH(h: number) { return decimalToHMin(h) }

function getMonday(d: Date): Date {
  const r = new Date(d)
  const dow = (r.getDay() + 6) % 7
  r.setDate(r.getDate() - dow)
  return r
}

function getWeeksOfMonth(days: Date[]): { label: string; days: Date[] }[] {
  const weekMap = new Map<string, Date[]>()
  const weekOrder: string[] = []
  for (const d of days) {
    const dow = (d.getDay() + 6) % 7 // 0=Mon, 6=Sun
    const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow)
    const key = `${mon.getFullYear()}-${mon.getMonth()}-${mon.getDate()}`
    if (!weekMap.has(key)) { weekMap.set(key, []); weekOrder.push(key) }
    weekMap.get(key)!.push(d)
  }
  return weekOrder.map((key, i) => ({ label: `S${i + 1}`, days: weekMap.get(key)! }))
}

function getScheduleType(
  code: string,
  shiftCodes: ShiftCode[],
  absenceCodes: AbsenceCode[]
): 'shift' | 'repos' | 'conge' | 'absence' {
  if (shiftCodes.some(c => c.code === code)) return 'shift'
  const ac = absenceCodes.find(c => c.code === code)
  if (ac?.is_paid) return 'conge'
  if (code === 'R' || code === 'REP' || code === 'FER') return 'repos'
  return 'absence'
}

function isCadreWorkedDay(code: string | null | undefined, shiftCodes: ShiftCode[], absenceCodes: AbsenceCode[]): boolean {
  if (!code) return false
  return getScheduleType(code, shiftCodes, absenceCodes) === 'shift'
}

// ─── Conformité droit du travail ──────────────────────────────────────────────

type ConformiteAlert = { severity: 'red' | 'orange'; rule: string; detail: string }
type EmployeeConformite = { employee: Employee; alerts: ConformiteAlert[] }
type ConformiteReport = { perEmployee: EmployeeConformite[]; totalAlerts: number; totalEmployeesWithAlerts: number }

function fmtTime(totalMins: number): string {
  const m = ((totalMins % (24 * 60)) + 24 * 60) % (24 * 60)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
function fmtDuration(mins: number): string {
  const h = Math.floor(mins / 60); const m = mins % 60
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}
function timeStrToMins(t: string | null | undefined): number | null {
  if (!t) return null
  const parts = t.split(':')
  const h = Number(parts[0]); const m = Number(parts[1] ?? '0')
  if (isNaN(h) || isNaN(m)) return null
  return h * 60 + m
}

function computeConformite(
  employees: Employee[],
  days: Date[],
  cellValues: Record<string, string>,
  shiftCodes: ShiftCode[],
  absenceCodes: AbsenceCode[],
  month: number
): ConformiteReport {
  const MONTHS_LONG = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']

  interface DayInfo {
    d: Date; dateStr: string; worked: boolean
    startMins: number | null; endMins: number | null; netH: number
  }

  function fmtDate(d: Date) {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  function isWorked(code: string | null | undefined): boolean {
    return !!code && getScheduleType(code, shiftCodes, absenceCodes) === 'shift'
  }

  const perEmployee: EmployeeConformite[] = []

  for (const emp of employees) {
    const alerts: ConformiteAlert[] = []
    const isCadre = emp.statut === 'cadre'
    const isTmp = isTemporaire(emp.contract_type)
    const isCDI = (emp.contract_type ?? '').toUpperCase() === 'CDI'

    const empDays: DayInfo[] = days.map(d => {
      const dateStr = toISO(d)
      const code = cellValues[`${emp.id}|${dateStr}`] || null
      if (!code || !isWorked(code)) return { d, dateStr, worked: false, startMins: null, endMins: null, netH: 0 }
      const sc = shiftCodes.find(c => c.code === code)
      const startMins = timeStrToMins(sc?.start_time)
      let endMins = timeStrToMins(sc?.end_time)
      if (startMins !== null && endMins !== null && endMins < startMins) endMins += 24 * 60
      return { d, dateStr, worked: true, startMins, endMins, netH: Number(sc?.net_hours ?? sc?.paid_hours ?? 0) }
    })

    if (!isCadre) {
      // 1. Amplitude journalière > 13h
      for (const day of empDays) {
        if (!day.worked || day.startMins === null || day.endMins === null) continue
        const amp = day.endMins - day.startMins
        if (amp > 13 * 60) {
          alerts.push({
            severity: 'red', rule: 'Amplitude journalière > 13h',
            detail: `${fmtDate(day.d)} : ${fmtTime(day.startMins)}–${fmtTime(day.endMins)} → ${fmtDuration(amp)} d'amplitude (max 13h)`,
          })
        }
      }

      // 2. Repos quotidien < 11h
      for (let i = 0; i < empDays.length - 1; i++) {
        const cur = empDays[i]; const nxt = empDays[i + 1]
        if (!cur.worked || !nxt.worked || cur.endMins === null || nxt.startMins === null) continue
        const rest = (i + 1) * 24 * 60 + nxt.startMins - (i * 24 * 60 + cur.endMins)
        if (rest < 11 * 60) {
          alerts.push({
            severity: 'red', rule: 'Repos quotidien < 11h',
            detail: `${fmtDate(cur.d)} (fin ${fmtTime(cur.endMins)}) → ${fmtDate(nxt.d)} (début ${fmtTime(nxt.startMins)}) : repos de ${fmtDuration(Math.max(0, rest))} (minimum 11h)`,
          })
        }
      }

      // 3. Max 6 jours consécutifs
      let streak = 0; let streakStart = 0
      for (let i = 0; i <= empDays.length; i++) {
        if (i < empDays.length && empDays[i].worked) {
          if (streak === 0) streakStart = i
          streak++
        } else {
          if (streak > 6) {
            alerts.push({
              severity: 'red', rule: 'Plus de 6 jours consécutifs travaillés',
              detail: `Du ${fmtDate(empDays[streakStart].d)} au ${fmtDate(empDays[i - 1].d)} : ${streak} jours consécutifs (maximum 6)`,
            })
          }
          streak = 0
        }
      }

      // 4 & 5. Par semaine
      const weeksList = getWeeksOfMonth(days)
      for (const week of weeksList) {
        // 4. 48h max
        const weekH = week.days.reduce((s, d) => s + (empDays.find(x => x.dateStr === toISO(d))?.netH ?? 0), 0)
        if (weekH > 48) {
          alerts.push({
            severity: 'red', rule: 'Durée hebdomadaire > 48h',
            detail: `Semaine du ${fmtDate(week.days[0])} au ${fmtDate(week.days[week.days.length - 1])} : ${weekH.toFixed(1)}h travaillées (maximum 48h)`,
          })
        }

        // 5. 35h repos consécutifs (semaines complètes uniquement)
        if (week.days.length === 7) {
          const intervals: { start: number; end: number }[] = []
          for (let i = 0; i < 7; i++) {
            const di = empDays.find(x => x.dateStr === toISO(week.days[i]))
            if (!di?.worked || di.startMins === null || di.endMins === null) continue
            intervals.push({ start: i * 24 * 60 + di.startMins, end: i * 24 * 60 + di.endMins })
          }
          intervals.sort((a, b) => a.start - b.start)
          const merged: { start: number; end: number }[] = []
          for (const iv of intervals) {
            if (!merged.length || merged[merged.length - 1].end < iv.start) merged.push({ ...iv })
            else merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, iv.end)
          }
          let maxRest = 0; let cursor = 0
          for (const iv of merged) { maxRest = Math.max(maxRest, iv.start - cursor); cursor = iv.end }
          maxRest = Math.max(maxRest, 7 * 24 * 60 - cursor)
          if (maxRest < 35 * 60) {
            alerts.push({
              severity: 'red', rule: 'Repos hebdomadaire < 35h consécutives',
              detail: `Semaine du ${fmtDate(week.days[0])} au ${fmtDate(week.days[6])} : repos max de ${fmtDuration(maxRest)} (minimum 35h)`,
            })
          }
        }
      }
    }

    // 6. Week-end complet (CDI, hors temporaires)
    if (isCDI && !isTmp) {
      let hasWeekend = false
      for (let i = 0; i < empDays.length - 1; i++) {
        if (empDays[i].d.getDay() !== 6 || empDays[i + 1].d.getDay() !== 0) continue
        if (!empDays[i].worked && !empDays[i + 1].worked) { hasWeekend = true; break }
      }
      if (!hasWeekend) {
        alerts.push({
          severity: 'orange', rule: 'Aucun week-end complet dans le mois',
          detail: `Aucun week-end complet (samedi + dimanche en repos) en ${MONTHS_LONG[month]}`,
        })
      }
    }

    if (alerts.length > 0) perEmployee.push({ employee: emp, alerts })
  }

  return {
    perEmployee,
    totalAlerts: perEmployee.reduce((s, e) => s + e.alerts.length, 0),
    totalEmployeesWithAlerts: perEmployee.length,
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type CellStatus = 'idle' | 'saving' | 'saved' | 'error'
type AllCode = { code: string; label: string; kind: 'shift' | 'absence'; start_time?: string | null; end_time?: string | null }

// ─── CellInput ────────────────────────────────────────────────────────────────

function CellInput({
  saved, status, errorMsg, shiftCodes, absenceCodes, teamShiftCodes, onSave, isWeekend,
  isSelected, onNormalClick, onShiftClick, onContextMenu,
}: {
  saved: string
  status: CellStatus
  errorMsg?: string
  shiftCodes: ShiftCode[]        // tous les codes (pour cellBg / validation)
  teamShiftCodes: ShiftCode[]    // codes filtrés par équipe (pour suggestions)
  absenceCodes: AbsenceCode[]
  onSave: (code: string) => void
  isWeekend: boolean
  isSelected: boolean
  onNormalClick: () => void
  onShiftClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const [val, setVal] = useState(saved)
  const [open, setOpen] = useState(false)
  const [flash, setFlash] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setVal(saved) }, [saved])

  useEffect(() => {
    if (status === 'saved') {
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 1400)
      return () => clearTimeout(t)
    }
  }, [status])

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  // Suggestions = codes de l'équipe + codes absence (pas les codes d'autres équipes)
  const allCodes: AllCode[] = [
    ...teamShiftCodes.map(c => ({ code: c.code, label: c.label, kind: 'shift' as const, start_time: c.start_time, end_time: c.end_time })),
    ...absenceCodes.map(c => ({ code: c.code, label: c.label, kind: 'absence' as const })),
  ]
  // isValidCode accepts ALL shift codes (y compris autres équipes) + absence codes
  const allValidCodes = new Set([
    ...shiftCodes.map(c => c.code),
    ...absenceCodes.map(c => c.code),
  ])
  const suggestions = allCodes.filter(c => val.length === 0 || c.code.startsWith(val))

  function isValidCode(code: string): boolean {
    return code === '' || allValidCodes.has(code)
  }

  function commit(code: string) {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    const upper = code.trim().toUpperCase()
    if (isValidCode(upper)) { setVal(upper); onSave(upper) }
    else setVal(saved)
    setOpen(false)
  }

  const codeColor = val ? getCodeColors(val, shiftCodes, absenceCodes) : null
  const bgStyle: React.CSSProperties = codeColor
    ? { background: codeColor.bg, color: codeColor.text }
    : {}

  // Priority: error > flash/saved > selected
  const ring = flash
    ? 'outline outline-2 outline-emerald-400 z-10'
    : status === 'error'
    ? 'outline outline-2 outline-red-400 z-10'
    : ''

  const selectionStyle: React.CSSProperties = isSelected && !flash && status !== 'error'
    ? { boxShadow: 'inset 0 0 0 2px #3b82f6', zIndex: 10, position: 'relative' }
    : {}

  return (
    <div
      className={`relative w-full h-full ${ring} transition-all`}
      style={{ ...bgStyle, ...selectionStyle }}
      title={status === 'error' ? errorMsg : allCodes.find(c => c.code === val)?.label}
      onMouseDown={e => {
        if (e.button !== 0) return
        if (e.shiftKey) {
          e.preventDefault() // prevent focus on shift+click
          onShiftClick()
        } else {
          onNormalClick()
        }
      }}
      onContextMenu={e => { e.preventDefault(); onContextMenu(e) }}
    >
      <input
        value={val}
        onChange={e => {
          const upper = e.target.value.toUpperCase()
          setVal(upper)
          setOpen(true)
          if (debounceRef.current) clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(() => {
            debounceRef.current = null
            const trimmed = upper.trim()
            if (isValidCode(trimmed)) onSave(trimmed)
          }, 800)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setTimeout(() => setOpen(false), 130); commit(val) }}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
            setVal(saved); setOpen(false)
          }
          if (e.key === 'Tab') commit(val)
        }}
        className="w-full h-full text-center text-[10px] font-mono bg-transparent focus:outline-none uppercase rounded"
        maxLength={5}
      />

      {status === 'saving' && (
        <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse pointer-events-none" />
      )}
      {status === 'error' && (
        <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-red-500 pointer-events-none" />
      )}

      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg min-w-[260px] max-h-[300px] overflow-y-auto">
          {suggestions.some(c => c.kind === 'shift') && (
            <>
              <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100 sticky top-0">
                Codes horaires
              </div>
              {suggestions.filter(c => c.kind === 'shift').map(c => (
                <button
                  key={c.code}
                  onMouseDown={e => {
                    e.preventDefault()
                    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
                    setVal(c.code); onSave(c.code); setOpen(false)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-blue-50 text-left"
                >
                  <span className="font-mono font-bold w-10 shrink-0 text-blue-600">{c.code}</span>
                  <span className="text-gray-500 truncate flex-1">{c.label}</span>
                  {c.start_time && (
                    <span className="text-gray-400 shrink-0">{c.start_time.slice(0, 5)}–{c.end_time?.slice(0, 5)}</span>
                  )}
                </button>
              ))}
            </>
          )}
          {suggestions.some(c => c.kind === 'absence') && (
            <>
              <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100 sticky top-0">
                Absences
              </div>
              {suggestions.filter(c => c.kind === 'absence').map(c => (
                <button
                  key={c.code}
                  onMouseDown={e => {
                    e.preventDefault()
                    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
                    setVal(c.code); onSave(c.code); setOpen(false)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-blue-50 text-left"
                >
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

// ─── Main ─────────────────────────────────────────────────────────────────────

type ContextMenu = { x: number; y: number; keys: string[] }

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const DAY_ABBR = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam']

export default function TabSaisie({ employees, schedules, shiftCodes, absenceCodes, jobFunctions = [], year, month, teamId, teamName, calendarDays, isArchived, archiveDate, onArchived, onRefresh }: TabProps) {
  const days = getDays(year, month)
  const today = toISO(new Date())
  const weeks = getWeeksOfMonth(days)

  // Build structure name + id lookups for day headers
  const calStructureMap: Record<string, string> = {}
  const calStructureIdMap: Record<string, string> = {}
  if (calendarDays) {
    for (const c of calendarDays) {
      if (c.structure_name) calStructureMap[c.date] = c.structure_name
      if (c.structure_id) calStructureIdMap[c.date] = c.structure_id
    }
  }

  const { can } = usePermissions()
  const canEditPast = can('edit_past_planning')
  const { role } = useAuth()

  const [cellValues, setCellValues] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const s of schedules) { if (s.code) m[`${s.employee_id}|${s.date}`] = s.code }
    return m
  })
  // Ref toujours à jour — permet à saveCell de lire la dernière valeur sans être dans ses deps
  const cellValuesRef = useRef(cellValues)
  cellValuesRef.current = cellValues
  const [cellStatus, setCellStatus] = useState<Record<string, CellStatus>>({})
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({})
  const [globalError, setGlobalError] = useState<string | null>(null)
  const outerRef = useRef<HTMLDivElement>(null)
  const [dynDayW, setDynDayW] = useState(36)

  // ── Confirmation modification passé ──
  const [pastConfirm, setPastConfirm] = useState<{ empId: string; dateStr: string; code: string; cellKey: string } | null>(null)
  const [cellResetVersions, setCellResetVersions] = useState<Record<string, number>>({})
  const [showArchiveModal, setShowArchiveModal] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [archiveStep, setArchiveStep] = useState<'pdf' | 'saving' | null>(null)

  // ── Vider le planning ──
  const [showClearModal, setShowClearModal] = useState(false)
  const [clearConfirmText, setClearConfirmText] = useState('')
  const [clearing, setClearing] = useState(false)
  const [clearResult, setClearResult] = useState<string | null>(null)

  // ── Cycle modal ──
  const [showCycleModal, setShowCycleModal] = useState(false)
  const [cycleStartWeek, setCycleStartWeek] = useState(1)
  const [cycleStartDate, setCycleStartDate] = useState(`${year}-${String(month + 1).padStart(2, '0')}-01`)
  const [cycleEndDate, setCycleEndDate] = useState(() => toISO(new Date(year, month + 1, 0)))
  const [cycleOverwrite, setCycleOverwrite] = useState(false)
  const [cycleApplying, setCycleApplying] = useState(false)
  const [cycleResult, setCycleResult] = useState<{ filled: number; emps: number; kept: number; noData: number } | null>(null)
  const [cycleSuggestion, setCycleSuggestion] = useState<{ week: number; monthLabel: string } | null>(null)

  // ── Intérimaires ──
  const [showInterimModal, setShowInterimModal] = useState(false)
  const [interimMode, setInterimMode] = useState<'select' | 'create'>('select')
  const [newInterimLabel, setNewInterimLabel] = useState('')
  const [selectedExistingId, setSelectedExistingId] = useState('')
  const [availableInterims, setAvailableInterims] = useState<{ id: string; first_name: string; last_name: string }[]>([])
  const [loadingAvailable, setLoadingAvailable] = useState(false)
  const [interimAdding, setInterimAdding] = useState(false)

  // ── Conformité ──
  const [showComplianceModal, setShowComplianceModal] = useState(false)
  const [complianceReport, setComplianceReport] = useState<ConformiteReport | null>(null)

  function runConformite() {
    setComplianceReport(computeConformite(employees, days, cellValues, shiftCodes, absenceCodes, month))
    setShowComplianceModal(true)
  }

  // ── Bandeau effectifs ──
  const [bandeauOpen, setBandeauOpen] = useState(false)
  const [structurePositions, setStructurePositions] = useState<Record<string, { position_name: string; required_count: number }[]>>({})

  // ── Selection state ──
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [clipboard, setClipboard] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const anchorRef = useRef<{ empId: string; dateStr: string } | null>(null)

  // ── Save ──────────────────────────────────────────────────────────────────
  const saveCell = useCallback(async (empId: string, dateStr: string, code: string) => {
    const key = `${empId}|${dateStr}`
    const prevCode = cellValuesRef.current[key] ?? ''
    if (code === prevCode) return

    setCellValues(cur => { const n = { ...cur }; if (code) n[key] = code; else delete n[key]; return n })
    setCellErrors(cur => { const n = { ...cur }; delete n[key]; return n })

    try {
      if (!code) {
        const { error } = await supabase.from('schedules').delete().eq('employee_id', empId).eq('date', dateStr)
        if (error) throw error
      } else {
        const sc = shiftCodes.find(c => c.code === code)
        const upsertPayload = {
          employee_id: empId, team_id: teamId, date: dateStr, code,
          type: getScheduleType(code, shiftCodes, absenceCodes),
          start_time: sc?.start_time ?? null, end_time: sc?.end_time ?? null,
          break_minutes: sc?.break_minutes ?? 0, status: 'brouillon', notes: null,
        }
        const { error } = await supabase
          .from('schedules').upsert(upsertPayload, { onConflict: 'employee_id,date' })
        if (error) throw error
      }

      setCellStatus(cur => ({ ...cur, [key]: 'saved' }))
      setTimeout(() => setCellStatus(cur => {
        if (cur[key] === 'saved') { const n = { ...cur }; n[key] = 'idle'; return n }
        return cur
      }), 1600)
    } catch (err: any) {
      const msg: string = err?.message ?? err?.details ?? err?.hint ?? JSON.stringify(err)
      console.error(`[Saisie] FAILED key=${key}:`, err)
      setCellValues(cur => { const n = { ...cur }; if (prevCode) n[key] = prevCode; else delete n[key]; return n })
      setCellStatus(cur => ({ ...cur, [key]: 'error' }))
      setCellErrors(cur => ({ ...cur, [key]: msg }))
      setGlobalError(msg)
      setTimeout(() => setCellStatus(cur => {
        if (cur[key] === 'error') { const n = { ...cur }; n[key] = 'idle'; return n }
        return cur
      }), 6000)
    }
  }, [shiftCodes, absenceCodes, teamId])

  // ── Modification passé : wrapper de saveCell ──────────────────────────────
  function handleSaveCell(empId: string, dateStr: string, code: string) {
    const cellKey = `${empId}|${dateStr}`
    if (dateStr < today) {
      const label = new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      setPastConfirm({ empId, dateStr, code, cellKey })
      return
    }
    saveCell(empId, dateStr, code)
  }

  function confirmPastSave() {
    if (!pastConfirm) return
    saveCell(pastConfirm.empId, pastConfirm.dateStr, pastConfirm.code)
    setPastConfirm(null)
  }

  function cancelPastSave() {
    if (!pastConfirm) return
    setCellResetVersions(v => ({ ...v, [pastConfirm.cellKey]: (v[pastConfirm.cellKey] ?? 0) + 1 }))
    setPastConfirm(null)
  }

  // ── Archivage ─────────────────────────────────────────────────────────────
  async function archivePlanning() {
    setArchiving(true)
    let pdfUrl: string | null = null

    try {
      // 1. Générer le PDF
      setArchiveStep('pdf')
      try {
        const { blob, dataUrl } = await generatePlanningPdf({
          employees, schedules, shiftCodes, absenceCodes, year, month, teamName,
        })

        // Essayer d'uploader dans Supabase Storage (bucket privé)
        const storagePath = `${teamId}/${year}-${String(month + 1).padStart(2, '0')}.pdf`
        const { error: uploadError } = await supabase.storage
          .from('planning-pdfs')
          .upload(storagePath, blob, { contentType: 'application/pdf', upsert: true })

        if (!uploadError) {
          // Stocker uniquement le PATH — l'URL signée est générée à la demande dans TabArchives
          pdfUrl = storagePath
        } else {
          // Fallback : stocker le dataUrl base64 directement (commence par "data:")
          console.warn('Storage upload failed, falling back to base64:', uploadError.message)
          pdfUrl = dataUrl
        }
      } catch (pdfErr) {
        console.warn('Génération PDF échouée, archivage sans PDF :', pdfErr)
      }

      // 2. Insérer l'archive
      setArchiveStep('saving')
      const { error } = await supabase.from('planning_archives').insert({
        team_id: teamId,
        month: month + 1,
        year,
        archived_by: 'Utilisateur',
        status: 'archived',
        pdf_url: pdfUrl,
      })
      if (error) throw error

      setShowArchiveModal(false)
      onArchived?.()
    } catch (err: any) {
      setGlobalError(err?.message ?? 'Erreur lors de l\'archivage')
    } finally {
      setArchiving(false)
      setArchiveStep(null)
    }
  }

  // ── Vider le planning ─────────────────────────────────────────────────────
  async function clearPlanning() {
    if (isArchived) { setClearResult('Impossible : ce planning est archivé.'); return }
    setClearing(true)
    const pad2 = (n: number) => String(n).padStart(2, '0')
    const start = `${year}-${pad2(month + 1)}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const end = `${year}-${pad2(month + 1)}-${pad2(lastDay)}`
    const { error, count } = await supabase.from('schedules')
      .delete({ count: 'exact' })
      .eq('team_id', teamId)
      .gte('date', start)
      .lte('date', end)
    if (error) {
      setClearResult(`Erreur : ${error.message}`)
    } else {
      const n = count ?? 0
      setClearResult(`Planning vidé. ${n} jour${n > 1 ? 's' : ''} de planning supprimé${n > 1 ? 's' : ''}.`)
      onRefresh?.()
    }
    setClearing(false)
    setClearConfirmText('')
  }

  // ── Cycle ─────────────────────────────────────────────────────────────────
  async function applyCycle() {
    setCycleApplying(true)
    setCycleResult(null)
    try {
      const { data: cycleData, error: cycleErr } = await supabase
        .from('cycle_schedules')
        .select('employee_id, week_number, day_of_week, code')
        .eq('team_id', teamId)
      if (cycleErr) throw cycleErr

      const cycleLookup: Record<string, Record<number, Record<number, string>>> = {}
      for (const row of (cycleData ?? [])) {
        const empKey = row.employee_id ?? 'ALL'
        if (!cycleLookup[empKey]) cycleLookup[empKey] = {}
        if (!cycleLookup[empKey][row.week_number]) cycleLookup[empKey][row.week_number] = {}
        cycleLookup[empKey][row.week_number][row.day_of_week] = row.code
      }

      const startDate = new Date(cycleStartDate + 'T00:00:00')
      const endDate = new Date(cycleEndDate + 'T00:00:00')
      const rangeDays: Date[] = []
      const cur = new Date(startDate)
      while (cur <= endDate) { rangeDays.push(new Date(cur)); cur.setDate(cur.getDate() + 1) }

      const toUpsert: any[] = []
      let filled = 0, kept = 0, noData = 0
      const empsFilled = new Set<string>()

      let currentCycleWeek = cycleStartWeek
      let currentDow = (startDate.getDay() + 6) % 7 + 1 // 1=Mon..7=Sun

      for (const d of rangeDays) {
        const dow = currentDow
        const cycleWeek = currentCycleWeek
        const dateStr = toISO(d)

        for (const emp of employees) {
          const key = `${emp.id}|${dateStr}`
          const existingCode = cellValuesRef.current[key]
          const cycleCode = cycleLookup[emp.id]?.[cycleWeek]?.[dow]
            ?? cycleLookup['ALL']?.[cycleWeek]?.[dow]
            ?? null

          if (!cycleCode) { noData++; continue }
          if (existingCode && !cycleOverwrite) { kept++; continue }

          const sc = shiftCodes.find(c => c.code === cycleCode)
          toUpsert.push({
            employee_id: emp.id, team_id: teamId, date: dateStr, code: cycleCode,
            type: getScheduleType(cycleCode, shiftCodes, absenceCodes),
            start_time: sc?.start_time ?? null, end_time: sc?.end_time ?? null,
            break_minutes: sc?.break_minutes ?? 0, status: 'brouillon', notes: null,
          })
          filled++
          empsFilled.add(emp.id)
        }

        if (currentDow === 7) { currentDow = 1; currentCycleWeek = (currentCycleWeek % 6) + 1 }
        else currentDow++
      }

      if (toUpsert.length > 0) {
        for (let i = 0; i < toUpsert.length; i += 500) {
          const { error } = await supabase.from('schedules')
            .upsert(toUpsert.slice(i, i + 500), { onConflict: 'employee_id,date' })
          if (error) throw error
        }
        setCellValues(cur => {
          const n = { ...cur }
          for (const row of toUpsert) n[`${row.employee_id}|${row.date}`] = row.code
          return n
        })
      }

      setCycleResult({ filled, emps: empsFilled.size, kept, noData })
    } catch (err: any) {
      setGlobalError(err?.message ?? 'Erreur lors de l\'application du cycle')
      setShowCycleModal(false)
    } finally {
      setCycleApplying(false)
    }
  }

  async function computeCycleSuggestion(): Promise<{ week: number; monthLabel: string } | null> {
    try {
      const prevLastDay = new Date(year, month, 0)
      const prevYear = prevLastDay.getFullYear()
      const prevMonth = prevLastDay.getMonth()

      const last7Days: Date[] = []
      for (let i = 6; i >= 0; i--) {
        last7Days.push(new Date(prevYear, prevMonth, prevLastDay.getDate() - i))
      }
      const last7Strs = last7Days.map(d => toISO(d))

      const [{ data: prevSchedules }, { data: cycleData }] = await Promise.all([
        supabase.from('schedules').select('employee_id, date, code').eq('team_id', teamId).in('date', last7Strs),
        supabase.from('cycle_schedules').select('employee_id, week_number, day_of_week, code').eq('team_id', teamId),
      ])

      if (!prevSchedules?.length || !cycleData?.length) return null

      const actualRepos: Record<string, Record<number, boolean>> = {}
      for (const s of prevSchedules) {
        if (!actualRepos[s.employee_id]) actualRepos[s.employee_id] = {}
        const d = last7Days.find(dd => toISO(dd) === s.date)
        if (!d) continue
        const dow = (d.getDay() + 6) % 7 + 1
        actualRepos[s.employee_id][dow] = s.code === 'R' || s.code === 'REP' || s.code === 'FER'
      }

      const cycleRepos: Record<string, Record<number, Record<number, boolean>>> = {}
      for (const c of cycleData) {
        const empKey = c.employee_id ?? 'ALL'
        if (!cycleRepos[empKey]) cycleRepos[empKey] = {}
        if (!cycleRepos[empKey][c.week_number]) cycleRepos[empKey][c.week_number] = {}
        cycleRepos[empKey][c.week_number][c.day_of_week] = c.code === 'R' || c.code === 'REP' || c.code === 'FER'
      }

      const last7Dows = last7Days.map(d => (d.getDay() + 6) % 7 + 1)
      const scores = [0, 0, 0, 0, 0, 0, 0]

      for (const emp of employees) {
        const empActual = actualRepos[emp.id] ?? {}
        for (let w = 1; w <= 6; w++) {
          const cycleWeek = cycleRepos[emp.id]?.[w] ?? cycleRepos['ALL']?.[w] ?? {}
          let score = 0
          for (const dow of last7Dows) {
            if ((empActual[dow] ?? false) === (cycleWeek[dow] ?? false)) score++
          }
          scores[w] += score
        }
      }

      let bestWeek = 1, bestScore = -1
      for (let w = 1; w <= 6; w++) {
        if (scores[w] > bestScore) { bestScore = scores[w]; bestWeek = w }
      }

      return { week: (bestWeek % 6) + 1, monthLabel: `${MONTHS_FR[prevMonth]} ${prevYear}` }
    } catch {
      return null
    }
  }

  async function openCycleModal() {
    setCycleResult(null)
    setCycleOverwrite(false)
    setCycleSuggestion(null)
    setCycleStartDate(`${year}-${String(month + 1).padStart(2, '0')}-01`)
    setCycleEndDate(toISO(new Date(year, month + 1, 0)))
    setShowCycleModal(true)
    const suggestion = await computeCycleSuggestion()
    if (suggestion) {
      setCycleStartWeek(suggestion.week)
      setCycleSuggestion(suggestion)
    } else {
      setCycleStartWeek(1)
    }
  }

  // ── Intérimaires ─────────────────────────────────────────────────────────
  async function openInterimModal() {
    setShowInterimModal(true)
    setInterimMode('select')
    setSelectedExistingId('')
    setNewInterimLabel('')
    setLoadingAvailable(true)
    const alreadyIds = new Set(employees.map(e => e.id))
    const { data } = await supabase.from('employees')
      .select('id, first_name, last_name')
      .eq('contract_type', 'INTERIM')
      .eq('is_active', true)
    setAvailableInterims((data ?? []).filter((e: any) => !alreadyIds.has(e.id)))
    setLoadingAvailable(false)
  }

  async function handleAddInterim() {
    const label = newInterimLabel.trim()
    if (!label) return
    setInterimAdding(true)
    try {
      const { data: empData, error: empErr } = await supabase
        .from('employees')
        .insert({ first_name: label, last_name: '', email: null, contract_type: 'INTERIM', is_active: true, weekly_contract_hours: 35 })
        .select('id').single()
      if (empErr) throw empErr
      const { error: etErr } = await supabase
        .from('employee_teams')
        .insert({ employee_id: empData.id, team_id: teamId, is_primary: false })
      if (etErr) throw etErr
      setNewInterimLabel('')
      setShowInterimModal(false)
      onRefresh?.()
    } catch (err: any) {
      setGlobalError(err?.message ?? 'Erreur lors de l\'ajout de l\'intérimaire')
    } finally {
      setInterimAdding(false)
    }
  }

  async function handleAddExistingInterim() {
    if (!selectedExistingId) return
    setInterimAdding(true)
    try {
      const { error } = await supabase
        .from('employee_teams')
        .insert({ employee_id: selectedExistingId, team_id: teamId, is_primary: false })
      if (error) throw error
      setShowInterimModal(false)
      onRefresh?.()
    } catch (err: any) {
      setGlobalError(err?.message ?? 'Erreur lors de l\'ajout')
    } finally {
      setInterimAdding(false)
    }
  }

  async function handleDeleteInterim(empId: string) {
    try {
      await supabase.from('schedules').delete().eq('employee_id', empId).eq('team_id', teamId)
      await supabase.from('employee_teams').delete().eq('employee_id', empId).eq('team_id', teamId)
      const { count } = await supabase.from('employee_teams')
        .select('id', { count: 'exact', head: true }).eq('employee_id', empId)
      if (!count) await supabase.from('employees').delete().eq('id', empId)
      onRefresh?.()
    } catch (err: any) {
      setGlobalError(err?.message ?? 'Erreur lors de la suppression de l\'intérimaire')
    }
  }

  // ── Selection helpers ──────────────────────────────────────────────────────
  function selectSingle(empId: string, dateStr: string) {
    anchorRef.current = { empId, dateStr }
    setSelected(new Set([`${empId}|${dateStr}`]))
  }

  function extendSelection(empId: string, dateStr: string) {
    if (!anchorRef.current) { selectSingle(empId, dateStr); return }
    const aEmpIdx = employees.findIndex(e => e.id === anchorRef.current!.empId)
    const aDayIdx = days.findIndex(d => toISO(d) === anchorRef.current!.dateStr)
    const tEmpIdx = employees.findIndex(e => e.id === empId)
    const tDayIdx = days.findIndex(d => toISO(d) === dateStr)
    const minE = Math.min(aEmpIdx, tEmpIdx), maxE = Math.max(aEmpIdx, tEmpIdx)
    const minD = Math.min(aDayIdx, tDayIdx), maxD = Math.max(aDayIdx, tDayIdx)
    const next = new Set<string>()
    for (let ei = minE; ei <= maxE; ei++)
      for (let di = minD; di <= maxD; di++)
        next.add(`${employees[ei].id}|${toISO(days[di])}`)
    setSelected(next)
  }

  // ── Copy / Paste / Delete ─────────────────────────────────────────────────
  const copySelected = useCallback(() => {
    const first = Array.from(selected)[0]
    if (!first) return
    const code = cellValues[first] ?? ''
    setClipboard(code)
  }, [selected, cellValues])

  const pasteToSelected = useCallback(() => {
    if (!clipboard) return
    for (const key of selected) {
      const [empId, dateStr] = key.split('|')
      saveCell(empId, dateStr, clipboard)
    }
  }, [clipboard, selected, saveCell])

  const deleteSelected = useCallback(() => {
    for (const key of selected) {
      const [empId, dateStr] = key.split('|')
      saveCell(empId, dateStr, '')
    }
    setContextMenu(null)
  }, [selected, saveCell])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      if (e.key === 'c' && selected.size > 0) { e.preventDefault(); copySelected() }
      if (e.key === 'v' && clipboard) { e.preventDefault(); pasteToSelected() }
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [selected, clipboard, copySelected, pasteToSelected])

  // ── Close context menu on outside click ───────────────────────────────────
  useEffect(() => {
    if (!contextMenu) return
    function handle() { setContextMenu(null) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [contextMenu])

  // ── Clear selection on click outside the table ───────────────────────────
  const tableRef = useRef<HTMLTableElement>(null)
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) {
        setSelected(new Set())
        anchorRef.current = null
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // ── Load structure positions when calendar changes ────────────────────────
  useEffect(() => {
    const seen = new Set<string>()
    const usedIds: string[] = []
    for (const c of (calendarDays ?? [])) {
      if (c.structure_id && !seen.has(c.structure_id)) {
        seen.add(c.structure_id)
        usedIds.push(c.structure_id)
      }
    }
    if (usedIds.length === 0) { setStructurePositions({}); return }
    supabase.from('staffing_structure_positions')
      .select('structure_id, position_name, required_count')
      .in('structure_id', usedIds)
      .then(({ data }: { data: any }) => {
        const map: Record<string, { position_name: string; required_count: number }[]> = {}
        for (const row of (data ?? [])) {
          if (!map[row.structure_id]) map[row.structure_id] = []
          map[row.structure_id].push({ position_name: row.position_name, required_count: row.required_count })
        }
        setStructurePositions(map)
      })
  }, [calendarDays])

  const DAY_LETTER = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

  // ── Codes filtrés par équipe — mémoïsé, recalculé seulement si shiftCodes/teamId changent
  const teamShiftCodes = useMemo(
    () => shiftCodes.filter(c => c.team_id === teamId || c.team_id === null),
    [shiftCodes, teamId]
  )

  // ── Codes horaires uniques présents dans les structures du mois
  const monthCodes = useMemo(() => {
    const seen = new Set<string>()
    const codes: string[] = []
    for (const dateStr of Object.keys(calStructureIdMap)) {
      const sid = calStructureIdMap[dateStr]
      for (const p of (structurePositions[sid] ?? [])) {
        if (!seen.has(p.position_name)) { seen.add(p.position_name); codes.push(p.position_name) }
      }
    }
    return codes.sort()
  }, [calStructureIdMap, structurePositions])

  // ── Totaux mensuels par employé — recalculé uniquement si cellValues/shiftCodes/teamId changent
  const empMonthlyTotals = useMemo(() => {
    const map: Record<string, number> = {}
    for (const emp of employees) {
      map[emp.id] = days.reduce((s, d) => {
        const dateStr = toISO(d)
        if (isDateBlocked(emp, dateStr)) return s
        return s + getPaidHours(cellValues[`${emp.id}|${dateStr}`], shiftCodes, teamId)
      }, 0)
    }
    return map
  }, [cellValues, employees, days, shiftCodes, teamId])

  // ── Totaux journaliers par date
  const dayTotals = useMemo(() => {
    const map: Record<string, number> = {}
    for (const d of days) {
      const dateStr = toISO(d)
      map[dateStr] = employees.reduce((s, e) => {
        if (isDateBlocked(e, dateStr)) return s
        return s + getPaidHours(cellValues[`${e.id}|${dateStr}`], shiftCodes, teamId)
      }, 0)
    }
    return map
  }, [cellValues, employees, days, shiftCodes, teamId])

  function monthlyLimit(emp: Employee): number { return (emp.weekly_contract_hours ?? 35) * 52 / 12 }

  // ── Stats par jour (requis vs présents)
  const REPOS_CODES_SET = new Set(['R', 'REP', 'FER'])
  const absenceCodeSet = new Set(absenceCodes.map(a => a.code))
  const CADRE_TRANCHE: Record<string, 'matin' | 'milieu' | 'soir'> = { 'P/O': 'matin', 'P': 'milieu', 'P/F': 'soir' }

  function getDayStats(dateStr: string) {
    const structId = calStructureIdMap[dateStr] ?? null
    const positions = structId ? (structurePositions[structId] ?? []) : []
    const required = positions.reduce((s, p) => s + p.required_count, 0)

    // C) Présents = TOUS les codes non-repos non-absence, hors salariés date-bloqués
    const presents = employees.filter(e => {
      if (isDateBlocked(e, dateStr)) return false
      const code = cellValues[`${e.id}|${dateStr}`]
      return code ? !REPOS_CODES_SET.has(code) && !absenceCodeSet.has(code) : false
    }).length

    // B) byCode.actual = uniquement depuis les schedules de la grille, hors salariés date-bloqués
    const byCode: Record<string, { required: number; actual: number }> = {}
    for (const p of positions) {
      byCode[p.position_name] = {
        required: p.required_count,
        actual: employees.filter(e => !isDateBlocked(e, dateStr) && cellValues[`${e.id}|${dateStr}`] === p.position_name).length,
      }
    }

    // D) Tranches horaires (hors salariés date-bloqués)
    let matin = 0, milieu = 0, soir = 0
    for (const e of employees) {
      if (isDateBlocked(e, dateStr)) continue
      const code = cellValues[`${e.id}|${dateStr}`]
      if (!code || REPOS_CODES_SET.has(code) || absenceCodeSet.has(code)) continue
      let tranche: 'matin' | 'milieu' | 'soir' | null = null
      if (code in CADRE_TRANCHE) {
        tranche = CADRE_TRANCHE[code]
      } else {
        const sc = shiftCodes.find(s => s.code === code)
        const startMin = timeStrToMins(sc?.start_time)
        if (startMin !== null) {
          if (startMin < 10 * 60) tranche = 'matin'
          else if (startMin <= 14 * 60) tranche = 'milieu'
          else tranche = 'soir'
        }
      }
      if (tranche === 'matin') matin++
      else if (tranche === 'milieu') milieu++
      else if (tranche === 'soir') soir++
    }

    return { required, presents, ecart: presents - required, byCode, hasStructure: !!structId, matin, milieu, soir }
  }

  function dayPresents(dateStr: string): number {
    return employees.filter(e => {
      const code = cellValues[`${e.id}|${dateStr}`]
      return code ? shiftCodes.some(s => s.code === code && (s.team_id === teamId || s.team_id === null)) : false
    }).length
  }

  const permanentEmployees = employees.filter(e => !isTemporaire(e.contract_type))
  const temporaireEmployees = employees.filter(e => isTemporaire(e.contract_type))
  const interimEmployees = employees.filter(e => (e.contract_type ?? '').toUpperCase() === 'INTERIM')

  useLayoutEffect(() => {
    const el = outerRef.current
    if (!el) return
    const NAME_W = 160, TOTAL_W = 56, WEEK_W = 40
    const recalc = () => {
      const avail = el.clientWidth - NAME_W - TOTAL_W - weeks.length * WEEK_W
      setDynDayW(Math.max(28, Math.floor(avail / days.length)))
    }
    recalc()
    const ro = new ResizeObserver(recalc)
    ro.observe(el)
    return () => ro.disconnect()
  }, [days.length, weeks.length])

  return (
    <div ref={outerRef} className="flex flex-col h-full overflow-hidden">

      {/* Archive banner */}
      {isArchived && (
        <div className="shrink-0 flex items-center gap-3 bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-sm text-amber-800">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span>
            <strong>Planning archivé</strong>
            {archiveDate && ` le ${new Date(archiveDate).toLocaleDateString('fr-FR')} à ${new Date(archiveDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
            {' — '}ce planning est verrouillé et ne peut plus être modifié.
          </span>
        </div>
      )}

      {/* Modal confirmation modification passé */}
      {pastConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={cancelPastSave} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Modification dans le passé</h2>
            <p className="text-sm text-gray-600 mb-5">
              Vous modifiez le planning du{' '}
              <strong>{new Date(pastConfirm.dateStr + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong>{' '}
              qui est dans le passé. Êtes-vous certain de vouloir effectuer cette modification ?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={cancelPastSave}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={confirmPastSave}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700">
                Confirmer la modification
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive confirmation modal */}
      {showArchiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowArchiveModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Archiver le planning</h2>
            <p className="text-sm text-gray-600 mb-5">
              Attention : ce planning sera <strong>verrouillé définitivement</strong>.<br />
              Confirmez-vous l'archivage du planning <strong>{teamName}</strong> — <strong>{MONTHS_FR[month]} {year}</strong> ?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowArchiveModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={archivePlanning} disabled={archiving}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50">
                {archiveStep === 'pdf' ? 'Génération PDF…' : archiveStep === 'saving' ? 'Archivage…' : 'Confirmer l\'archivage'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vider le planning modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => { if (!clearing) { setShowClearModal(false); setClearConfirmText(''); setClearResult(null) } }} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            {clearResult ? (
              <>
                <h2 className="text-base font-semibold text-gray-900 mb-3">
                  {clearResult.startsWith('Impossible') || clearResult.startsWith('Erreur') ? '⚠ Attention' : 'Planning vidé'}
                </h2>
                <p className={`text-sm rounded-lg px-4 py-3 ${clearResult.startsWith('Impossible') || clearResult.startsWith('Erreur') ? 'text-red-700 bg-red-50 border border-red-200' : 'text-emerald-700 bg-emerald-50 border border-emerald-200'}`}>
                  {clearResult}
                </p>
                <div className="flex justify-end mt-5">
                  <button onClick={() => { setShowClearModal(false); setClearResult(null) }}
                    className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg">
                    Fermer
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-base font-semibold text-red-700 mb-3">Vider le planning</h2>
                <p className="text-sm text-gray-700 mb-4">
                  <strong>ATTENTION</strong> : vous allez supprimer <strong>TOUS les codes saisis</strong> pour{' '}
                  <strong>{teamName}</strong> en <strong>{MONTHS_FR[month]} {year}</strong>. Cette action est irréversible.
                </p>
                <p className="text-sm text-gray-600 mb-2">
                  Pour confirmer, tapez <span className="font-mono font-bold text-red-700">SUPPRIMER</span> ci-dessous :
                </p>
                <input
                  value={clearConfirmText}
                  onChange={e => setClearConfirmText(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-300 mb-5"
                  placeholder="SUPPRIMER"
                  autoFocus
                />
                <div className="flex justify-end gap-3">
                  <button onClick={() => { setShowClearModal(false); setClearConfirmText('') }} disabled={clearing}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                    Annuler
                  </button>
                  <button onClick={clearPlanning} disabled={clearing || clearConfirmText !== 'SUPPRIMER'}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40">
                    {clearing ? 'Suppression…' : 'Vider le planning'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Cycle modal */}
      {showCycleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { if (!cycleApplying) setShowCycleModal(false) }} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Appliquer le cycle</h2>
            <p className="text-sm text-gray-500 mb-4">{teamName} — {MONTHS_FR[month]} {year}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Période d&apos;application</label>
                <div className="flex items-center gap-2">
                  <input type="date" value={cycleStartDate} onChange={e => setCycleStartDate(e.target.value)}
                    disabled={cycleApplying || !!cycleResult}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-50" />
                  <span className="text-gray-400 text-xs shrink-0">au</span>
                  <input type="date" value={cycleEndDate} onChange={e => setCycleEndDate(e.target.value)}
                    disabled={cycleApplying || !!cycleResult}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-50" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Semaine de cycle pour le 1er jour</label>
                <select value={cycleStartWeek} onChange={e => setCycleStartWeek(Number(e.target.value))}
                  disabled={cycleApplying || !!cycleResult}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-50">
                  {[1,2,3,4,5,6].map(w => <option key={w} value={w}>Semaine {w}</option>)}
                </select>
              </div>
              {cycleSuggestion && !cycleResult && (
                <p className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                  Suggestion : Semaine {cycleSuggestion.week} (basée sur le planning de {cycleSuggestion.monthLabel})
                </p>
              )}
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={cycleOverwrite} onChange={e => setCycleOverwrite(e.target.checked)}
                  disabled={cycleApplying || !!cycleResult}
                  className="accent-indigo-600 w-4 h-4" />
                <span className="text-sm text-gray-700">Écraser les cases déjà saisies</span>
              </label>
              {cycleResult && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3 text-sm text-indigo-800 space-y-0.5">
                  <div><strong>{cycleResult.filled}</strong> jour{cycleResult.filled !== 1 ? 's' : ''} rempli{cycleResult.filled !== 1 ? 's' : ''} pour <strong>{cycleResult.emps}</strong> salarié{cycleResult.emps !== 1 ? 's' : ''}</div>
                  {cycleResult.kept > 0 && <div className="text-indigo-600"><strong>{cycleResult.kept}</strong> conservé{cycleResult.kept !== 1 ? 's' : ''} (déjà saisi{cycleResult.kept !== 1 ? 's' : ''})</div>}
                  {cycleResult.noData > 0 && <div className="text-indigo-400"><strong>{cycleResult.noData}</strong> sans données de cycle</div>}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setShowCycleModal(false)} disabled={cycleApplying}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                {cycleResult ? 'Fermer' : 'Annuler'}
              </button>
              {!cycleResult && (
                <button onClick={applyCycle} disabled={cycleApplying}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {cycleApplying ? 'Application…' : 'Appliquer'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error banner */}
      {globalError && (
        <div className="shrink-0 flex items-start justify-between gap-3 bg-red-50 border-b border-red-200 px-4 py-2.5 text-sm text-red-700">
          <div>
            <strong>Erreur de sauvegarde :</strong> {globalError}
            <span className="ml-2 text-red-400 text-xs">(voir console F12 pour détails)</span>
          </div>
          <button onClick={() => setGlobalError(null)} className="text-red-400 hover:text-red-600 font-bold shrink-0 mt-0.5">✕</button>
        </div>
      )}

      {/* Selection info bar */}
      {selected.size > 1 && (
        <div className="shrink-0 flex items-center gap-3 bg-blue-50 border-b border-blue-200 px-4 py-1.5 text-xs text-blue-700">
          <span className="font-semibold">{selected.size} cellules sélectionnées</span>
          {clipboard && <span>· Clipboard : <span className="font-mono font-bold">{clipboard}</span></span>}
          <button onClick={pasteToSelected} disabled={!clipboard}
            className="ml-auto px-2 py-0.5 bg-blue-600 text-white rounded font-medium disabled:opacity-40 hover:bg-blue-700">
            Coller tout (Ctrl+V)
          </button>
          <button onClick={deleteSelected}
            className="px-2 py-0.5 bg-white border border-red-300 text-red-600 rounded font-medium hover:bg-red-50">
            Supprimer tout
          </button>
        </div>
      )}

      {/* Action bar: cycle + conformité + archive */}
      {!isArchived && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-0.5 border-b border-gray-100 bg-gray-50/60">
          <button onClick={openCycleModal}
            className="inline-flex items-center gap-2 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700 border border-indigo-200 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Appliquer le cycle
          </button>
          <button onClick={runConformite}
            className="inline-flex items-center gap-2 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Vérifier la conformité
          </button>
          <div className="ml-auto flex items-center gap-2">
            {year * 100 + month <= new Date().getFullYear() * 100 + new Date().getMonth() && (
              <button onClick={() => setShowArchiveModal(true)}
                className="inline-flex items-center gap-2 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12" />
                </svg>
                Archiver le mois
              </button>
            )}
            {isAdmin(role) && (
              <button onClick={() => setShowClearModal(true)}
                className="inline-flex items-center gap-2 px-2.5 py-0.5 text-[11px] font-medium text-red-600 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Vider le planning
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table ref={tableRef} className="border-collapse text-xs w-max min-w-full">
          <thead className="sticky top-0 z-20 bg-white">
            <tr>
              <th className="sticky left-0 z-30 bg-white border-b border-r border-gray-100 w-40 min-w-[160px] px-2 py-1 text-left text-gray-500 font-semibold text-[10px] uppercase tracking-wider">
                Employé
              </th>
              {days.map(d => {
                const isWE = d.getDay() === 0 || d.getDay() === 6
                const isMonday = d.getDay() === 1
                const isTo = toISO(d) === today
                const structName = calStructureMap[toISO(d)]
                return (
                  <th key={toISO(d)}
                    className="border-b border-r border-gray-100 py-0.5 text-center"
                    style={{ width: dynDayW, minWidth: dynDayW, background: isTo ? '#dbeafe' : isWE ? '#e5e7eb' : undefined, ...(isMonday ? { borderLeft: '2px solid #6b7280' } : {}) }}>
                    <div className="flex items-center justify-center gap-0.5 leading-none">
                      <span className={`text-[9px] ${isWE ? 'text-red-400' : isTo ? 'text-blue-400' : 'text-gray-400'}`}>{DAY_ABBR[d.getDay()]}</span>
                      {structName && <span className="w-1 h-1 rounded-full bg-violet-500 inline-block shrink-0" />}
                    </div>
                    <div className={`font-bold text-[11px] leading-none ${isTo ? 'text-blue-600' : isWE ? 'text-slate-600' : 'text-gray-700'}`}>{d.getDate()}</div>
                  </th>
                )
              })}
              {weeks.map(w => (
                <th key={w.label} className="w-10 min-w-[40px] border-b border-r border-indigo-200 bg-indigo-50 py-0.5 text-center text-indigo-600 font-bold text-[10px]">
                  {w.label}
                  <div className="text-[8px] font-normal text-indigo-400">{w.days.length}j</div>
                </th>
              ))}
              <th className="sticky right-0 z-30 bg-white border-b border-l border-gray-100 px-1 py-0.5 text-center text-gray-500 font-semibold text-[10px] uppercase tracking-wider w-14">
                Total
              </th>
            </tr>
            {/* ── Bandeau effectifs ── */}
            {/* Ligne résumée (toujours visible) */}
            <tr className={`border-b ${bandeauOpen ? 'border-indigo-100' : 'border-gray-100'}`}>
              <td className="sticky left-0 z-30 bg-white border-r border-gray-100 px-2 py-0 whitespace-nowrap">
                <button
                  onClick={() => setBandeauOpen(v => !v)}
                  className="flex items-center gap-1 text-[10px] font-semibold text-gray-500 hover:text-gray-900 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 transition-transform duration-150 shrink-0"
                    style={{ transform: bandeauOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                  Effectifs
                </button>
              </td>
              {days.map(d => {
                const dateStr = toISO(d)
                const stats = getDayStats(dateStr)
                const isWE = d.getDay() === 0 || d.getDay() === 6
                const isMonday = d.getDay() === 1
                return (
                  <td key={dateStr} className={`border-r border-gray-100 text-center py-0.5 ${isWE ? 'bg-slate-50' : ''}`}
                    style={isMonday ? { borderLeft: '2px solid #6b7280' } : undefined}>
                    {stats.hasStructure ? (
                      <span className={`text-[10px] font-bold leading-none ${stats.ecart >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {stats.ecart > 0 ? `+${stats.ecart}` : stats.ecart}
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-200">–</span>
                    )}
                  </td>
                )
              })}
              {weeks.map(w => <td key={w.label} className="border-r border-indigo-100 bg-indigo-50/30" />)}
              <td className="sticky right-0 z-30 bg-white border-l border-gray-100" />
            </tr>

            {/* Lignes détail (visible seulement si bandeauOpen) */}
            {bandeauOpen && (
              <>
                {/* Requis */}
                <tr className="border-b border-indigo-50">
                  <td className="sticky left-0 z-30 bg-indigo-50 border-r border-indigo-100 px-3 py-0.5 text-[11px] font-semibold text-indigo-500 whitespace-nowrap">
                    Requis
                  </td>
                  {days.map(d => {
                    const dateStr = toISO(d)
                    const stats = getDayStats(dateStr)
                    const isWE = d.getDay() === 0 || d.getDay() === 6
                    return (
                      <td key={dateStr} className={`border-r border-indigo-50 text-center py-0.5 text-[11px] font-semibold ${isWE ? 'bg-slate-50 text-slate-300' : stats.hasStructure ? 'text-indigo-600' : 'text-gray-300'}`}>
                        {stats.hasStructure ? stats.required : '–'}
                      </td>
                    )
                  })}
                  {weeks.map(w => <td key={w.label} className="border-r border-indigo-200 bg-indigo-50" />)}
                  <td className="sticky right-0 z-30 bg-indigo-50 border-l border-indigo-100" />
                </tr>

                {/* Présents */}
                <tr className="border-b border-emerald-50">
                  <td className="sticky left-0 z-30 bg-emerald-50 border-r border-emerald-100 px-3 py-0.5 text-[11px] font-semibold text-emerald-600 whitespace-nowrap">
                    Présents
                  </td>
                  {days.map(d => {
                    const dateStr = toISO(d)
                    const stats = getDayStats(dateStr)
                    const isWE = d.getDay() === 0 || d.getDay() === 6
                    return (
                      <td key={dateStr} className={`border-r border-emerald-50 text-center py-0.5 text-[11px] font-bold ${isWE ? 'bg-slate-50 text-slate-300' : stats.presents > 0 ? 'text-emerald-700' : 'text-gray-300'}`}>
                        {stats.presents > 0 ? stats.presents : '–'}
                      </td>
                    )
                  })}
                  {weeks.map(w => <td key={w.label} className="border-r border-indigo-200 bg-indigo-50/50" />)}
                  <td className="sticky right-0 z-30 bg-emerald-50 border-l border-emerald-100" />
                </tr>

                {/* Écart */}
                <tr className="border-b border-gray-200">
                  <td className="sticky left-0 z-30 bg-white border-r border-gray-100 px-3 py-0.5 text-[11px] font-semibold text-gray-500 whitespace-nowrap">
                    Écart
                  </td>
                  {days.map(d => {
                    const dateStr = toISO(d)
                    const stats = getDayStats(dateStr)
                    const isWE = d.getDay() === 0 || d.getDay() === 6
                    let cls = 'text-gray-300'
                    if (stats.hasStructure) cls = stats.ecart >= 0 ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'
                    return (
                      <td key={dateStr} className={`border-r border-gray-100 text-center py-0.5 text-[11px] ${isWE ? 'bg-slate-50' : ''} ${cls}`}>
                        {stats.hasStructure
                          ? (stats.ecart > 0 ? `+${stats.ecart}` : stats.ecart === 0 ? '=' : stats.ecart)
                          : '–'}
                      </td>
                    )
                  })}
                  {weeks.map(w => <td key={w.label} className="border-r border-indigo-200 bg-indigo-50/50" />)}
                  <td className="sticky right-0 z-30 bg-white border-l border-gray-100" />
                </tr>

                {/* Tranches horaires */}
                {(['matin', 'milieu', 'soir'] as const).map(tranche => (
                  <tr key={tranche} className="border-b border-gray-100">
                    <td className="sticky left-0 z-30 bg-gray-50 border-r border-gray-100 px-3 py-0.5 whitespace-nowrap capitalize"
                      style={{ fontSize: 9, color: '#9ca3af' }}>
                      {tranche.charAt(0).toUpperCase() + tranche.slice(1)}
                    </td>
                    {days.map(d => {
                      const dateStr = toISO(d)
                      const stats = getDayStats(dateStr)
                      const val = stats[tranche]
                      const isWE = d.getDay() === 0 || d.getDay() === 6
                      return (
                        <td key={dateStr} className={`border-r border-gray-100 text-center py-0.5 ${isWE ? 'bg-slate-50' : 'bg-gray-50'}`}
                          style={{ fontSize: 9, color: '#9ca3af' }}>
                          {val > 0 ? val : ''}
                        </td>
                      )
                    })}
                    {weeks.map(w => <td key={w.label} className="border-r border-indigo-100 bg-indigo-50/30" />)}
                    <td className="sticky right-0 z-30 bg-gray-50 border-l border-gray-100" />
                  </tr>
                ))}

                {/* Détail par code horaire */}
                {monthCodes.map(code => (
                  <tr key={code} className="border-b border-gray-100">
                    <td className="sticky left-0 z-30 bg-gray-50 border-r border-gray-100 px-3 py-0.5 whitespace-nowrap">
                      <span className="text-[10px] font-mono font-bold text-gray-600">{code}</span>
                    </td>
                    {days.map(d => {
                      const dateStr = toISO(d)
                      const stats = getDayStats(dateStr)
                      const codeData = stats.byCode[code]
                      const isWE = d.getDay() === 0 || d.getDay() === 6
                      if (!codeData) {
                        return <td key={dateStr} className={`border-r border-gray-100 ${isWE ? 'bg-slate-50' : 'bg-gray-50'}`} />
                      }
                      const diff = codeData.actual - codeData.required
                      const ok = diff >= 0
                      return (
                        <td key={dateStr} className={`border-r border-gray-100 text-center py-0.5 ${isWE ? 'bg-slate-50' : ok ? 'bg-emerald-50' : 'bg-red-50'}`}>
                          <span className={`text-[10px] font-mono font-semibold ${ok ? 'text-emerald-700' : 'text-red-700'}`}>
                            {codeData.actual}/{codeData.required}
                          </span>
                        </td>
                      )
                    })}
                    {weeks.map(w => <td key={w.label} className="border-r border-indigo-100 bg-indigo-50/30" />)}
                    <td className="sticky right-0 z-30 bg-gray-50 border-l border-gray-100" />
                  </tr>
                ))}
              </>
            )}
          </thead>

          <tbody>
            {permanentEmployees.map((emp) => {
              const isCadre = emp.statut === 'cadre'
              const monthH = empMonthlyTotals[emp.id] ?? 0
              const limit = monthlyLimit(emp)
              const over = monthH > limit + 0.5
              const cadreMonthDays = isCadre ? days.reduce((s, d) => {
                const dateStr = toISO(d)
                if (isDateBlocked(emp, dateStr)) return s
                const code = cellValues[`${emp.id}|${dateStr}`]
                return s + (isCadreWorkedDay(code, shiftCodes, absenceCodes) ? 1 : 0)
              }, 0) : 0
              return (
                <Fragment key={emp.id}>
                  <tr className="group hover:bg-blue-50/20">
                    <td className="sticky left-0 z-10 border-b border-r border-gray-100 px-2 py-0 h-6 bg-white group-hover:bg-blue-50">
                      <div className="flex items-center gap-1 overflow-hidden max-w-[160px]">
                        <span className="font-semibold text-[11px] text-gray-800 shrink-0 whitespace-nowrap">{emp.last_name.toUpperCase()}</span>
                        <span className="text-[11px] text-gray-500 truncate min-w-0">{emp.first_name}</span>
                        {emp.fonction && <span className="ml-0.5 text-gray-400 text-[9px] shrink-0 whitespace-nowrap" title={emp.fonction}>· {getFnCode(emp.fonction, jobFunctions)}</span>}
                      </div>
                    </td>
                    {days.map(d => {
                      const dateStr = toISO(d)
                      const isWE = d.getDay() === 0 || d.getDay() === 6
                      const isMonday = d.getDay() === 1
                      const isTo = dateStr === today
                      const isPast = dateStr < today
                      const key = `${emp.id}|${dateStr}`
                      const isSel = selected.has(key)
                      const blocked = isDateBlocked(emp, dateStr)
                      const pastDisabled = isPast && !canEditPast
                      return (
                        <td key={dateStr} className="border-b border-r border-gray-100 p-0 h-6 relative"
                          style={{ ...(isMonday ? { borderLeft: '2px solid #6b7280' } : {}), ...(isTo ? { background: '#eff6ff' } : isPast ? { background: '#f9fafb' } : {}) }}>
                          {blocked ? (
                            <div className="w-full h-full" style={{ background: '#e5e7eb' }}
                              title={emp.start_date && dateStr < emp.start_date ? `Entrée le ${emp.start_date}` : `Sortie le ${emp.end_date}`} />
                          ) : isArchived || pastDisabled ? (
                            <div
                              className="w-full h-full flex items-center justify-center text-xs font-mono"
                              style={(() => {
                                const c = cellValues[key] ? getCodeColors(cellValues[key], shiftCodes, absenceCodes) : null
                                return c ? { background: c.bg, color: c.text } : { background: pastDisabled ? '#f3f4f6' : '#f8fafc' }
                              })()}
                              title={pastDisabled ? 'Modification du passé non autorisée' : undefined}
                            >
                              {cellValues[key] || ''}
                            </div>
                          ) : (
                            <CellInput
                              key={`${key}|${cellResetVersions[key] ?? 0}`}
                              saved={cellValues[key] ?? ''}
                              status={cellStatus[key] ?? 'idle'}
                              errorMsg={cellErrors[key]}
                              shiftCodes={shiftCodes}
                              teamShiftCodes={teamShiftCodes}
                              absenceCodes={absenceCodes}
                              onSave={code => handleSaveCell(emp.id, dateStr, code)}
                              isWeekend={isWE}
                              isSelected={isSel}
                              onNormalClick={() => selectSingle(emp.id, dateStr)}
                              onShiftClick={() => extendSelection(emp.id, dateStr)}
                              onContextMenu={e => {
                                const keys = isSel ? Array.from(selected) : [key]
                                if (!isSel) selectSingle(emp.id, dateStr)
                                setContextMenu({ x: e.clientX, y: e.clientY, keys })
                              }}
                            />
                          )}
                        </td>
                      )
                    })}
                    {weeks.map(w => {
                      if (isCadre) {
                        const workedDays = w.days.reduce((s, d) => {
                          const dateStr = toISO(d)
                          if (isDateBlocked(emp, dateStr)) return s
                          const code = cellValues[`${emp.id}|${dateStr}`]
                          return s + (isCadreWorkedDay(code, shiftCodes, absenceCodes) ? 1 : 0)
                        }, 0)
                        return (
                          <td key={w.label} className={`border-b border-r border-indigo-100 px-0.5 h-6 text-center text-[10px] font-semibold ${
                            workedDays > 0 ? 'text-indigo-700 bg-indigo-50/50' : 'text-gray-200 bg-indigo-50/20'
                          }`}>
                            {workedDays > 0 ? `${workedDays}j` : ''}
                          </td>
                        )
                      }
                      const wh = w.days.reduce((s, d) => {
                        const dateStr = toISO(d)
                        if (isDateBlocked(emp, dateStr)) return s
                        return s + getPaidHours(cellValues[`${emp.id}|${dateStr}`], shiftCodes, teamId)
                      }, 0)
                      const over35 = wh > 35.5
                      return (
                        <td key={w.label} className={`border-b border-r border-indigo-100 px-0.5 h-6 text-center text-[10px] font-semibold ${
                          over35 ? 'text-red-600 bg-red-50' : wh > 0 ? 'text-indigo-700 bg-indigo-50/50' : 'text-gray-200 bg-indigo-50/20'
                        }`}>
                          {wh > 0 ? fmtH(wh) : ''}
                        </td>
                      )
                    })}
                    {isCadre ? (
                      <td className="sticky right-0 z-10 border-b border-l border-gray-100 px-1 h-6 text-center text-[10px] font-semibold bg-white group-hover:bg-blue-50 text-indigo-700">
                        {cadreMonthDays > 0 ? `${cadreMonthDays}j` : '—'}
                      </td>
                    ) : (
                      <td className={`sticky right-0 z-10 border-b border-l border-gray-100 px-1 h-6 text-center text-[10px] font-semibold bg-white group-hover:bg-blue-50 ${over ? 'text-red-600' : 'text-gray-700'}`}>
                        {fmtH(monthH)}
                        {over && <span className="block text-[8px] font-normal text-red-400">/{fmtH(limit)}</span>}
                      </td>
                    )}
                  </tr>
                </Fragment>
              )
            })}
          {/* ── Temporaires (Extras + Intérimaires) ── */}
          {(!isArchived || temporaireEmployees.length > 0) && (
            <>
              <tr>
                <td
                  colSpan={days.length + weeks.length + 2}
                  className="bg-gray-100 border-t border-b border-gray-200 px-3 py-0 text-[10px] font-semibold text-gray-500 uppercase tracking-widest"
                >
                  <div className="flex items-center justify-between">
                    <span>Temporaires{temporaireEmployees.length > 0 ? ` · ${temporaireEmployees.length}` : ''}</span>
                    {!isArchived && (
                      <button onClick={openInterimModal}
                        className="text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1">
                        + Ajouter un intérimaire
                      </button>
                    )}
                  </div>
                </td>
              </tr>

              {temporaireEmployees.map(emp => {
                const isInterim = (emp.contract_type ?? '').toUpperCase() === 'INTERIM'
                const monthH = empMonthlyTotals[emp.id] ?? 0
                return (
                  <tr key={emp.id} className="group bg-amber-50/20 hover:bg-amber-50/50">
                    <td className="sticky left-0 z-10 border-b border-r border-amber-100 px-2 py-0 h-6 whitespace-nowrap bg-amber-50 group-hover:bg-amber-100">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-amber-800 text-[11px]">
                          {isInterim
                            ? emp.last_name ? `${emp.last_name.toUpperCase()} (${emp.first_name})` : emp.first_name
                            : `${emp.last_name.toUpperCase()} ${emp.first_name}`}
                        </span>
                        {isInterim && !isArchived && (
                          <button onClick={() => handleDeleteInterim(emp.id)}
                            className="p-0.5 text-amber-300 hover:text-red-500 rounded transition-colors shrink-0" title="Supprimer l'intérimaire">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                    {days.map(d => {
                      const dateStr = toISO(d)
                      const isWE = d.getDay() === 0 || d.getDay() === 6
                      const isMonday = d.getDay() === 1
                      const isTo = dateStr === today
                      const isPast = dateStr < today
                      const key = `${emp.id}|${dateStr}`
                      const isSel = selected.has(key)
                      const pastDisabled = isPast && !canEditPast
                      return (
                        <td key={dateStr} className="border-b border-r border-amber-100 p-0 h-6 relative"
                          style={{ ...(isMonday ? { borderLeft: '2px solid #6b7280' } : {}), ...(isTo ? { background: '#eff6ff' } : isPast ? { background: '#f9fafb' } : {}) }}>
                          {isArchived || pastDisabled ? (
                            <div
                              className="w-full h-full flex items-center justify-center text-xs font-mono"
                              style={(() => {
                                const c = cellValues[key] ? getCodeColors(cellValues[key], shiftCodes, absenceCodes) : null
                                return c ? { background: c.bg, color: c.text } : { background: pastDisabled ? '#f3f4f6' : 'transparent' }
                              })()}
                              title={pastDisabled ? 'Modification du passé non autorisée' : undefined}
                            >
                              {cellValues[key] || ''}
                            </div>
                          ) : (
                            <CellInput
                              key={`${key}|${cellResetVersions[key] ?? 0}`}
                              saved={cellValues[key] ?? ''}
                              status={cellStatus[key] ?? 'idle'}
                              errorMsg={cellErrors[key]}
                              shiftCodes={shiftCodes}
                              teamShiftCodes={teamShiftCodes}
                              absenceCodes={absenceCodes}
                              onSave={code => handleSaveCell(emp.id, dateStr, code)}
                              isWeekend={isWE}
                              isSelected={isSel}
                              onNormalClick={() => selectSingle(emp.id, dateStr)}
                              onShiftClick={() => extendSelection(emp.id, dateStr)}
                              onContextMenu={e => {
                                const keys = isSel ? Array.from(selected) : [key]
                                if (!isSel) selectSingle(emp.id, dateStr)
                                setContextMenu({ x: e.clientX, y: e.clientY, keys })
                              }}
                            />
                          )}
                        </td>
                      )
                    })}
                    {weeks.map(w => {
                      const wh = w.days.reduce((s, d) => {
                        const dateStr = toISO(d)
                        if (isDateBlocked(emp, dateStr)) return s
                        return s + getPaidHours(cellValues[`${emp.id}|${dateStr}`], shiftCodes, teamId)
                      }, 0)
                      return (
                        <td key={w.label} className={`border-b border-r border-amber-100 px-0.5 h-6 text-center text-[10px] font-semibold ${wh > 0 ? 'text-amber-700 bg-amber-50/50' : 'text-gray-200 bg-amber-50/20'}`}>
                          {wh > 0 ? fmtH(wh) : ''}
                        </td>
                      )
                    })}
                    <td className="sticky right-0 z-10 border-b border-l border-amber-100 px-2 h-6 text-center font-semibold bg-amber-50 group-hover:bg-amber-100 text-amber-800">
                      {fmtH(monthH)}
                    </td>
                  </tr>
                )
              })}

            </>
          )}
          </tbody>

          <tfoot className="sticky bottom-0 z-20 bg-gray-50">
            <tr>
              <td className="sticky left-0 z-30 bg-gray-50 border-t border-r border-gray-100 px-2 py-0.5 font-semibold text-gray-500 text-[10px]">
                Total équipe
              </td>
              {days.map(d => {
                const dateStr = toISO(d)
                const h = dayTotals[dateStr] ?? 0
                const isWE = d.getDay() === 0 || d.getDay() === 6
                const isMonday = d.getDay() === 1
                return (
                  <td key={dateStr}
                    className={`border-t border-r border-gray-100 text-center font-semibold py-0.5 text-[10px] ${isWE ? 'bg-slate-100 text-slate-400' : h > 0 ? 'text-gray-700' : 'text-gray-300'}`}
                    style={isMonday ? { borderLeft: '2px solid #6b7280' } : undefined}>
                    {h > 0 ? fmtH(h) : ''}
                  </td>
                )
              })}
              {weeks.map(w => {
                const wh = employees.reduce((s, e) =>
                  s + w.days.reduce((ss, d) => ss + getPaidHours(cellValues[`${e.id}|${toISO(d)}`], shiftCodes, teamId), 0), 0)
                return (
                  <td key={w.label} className={`border-t border-r border-indigo-200 text-center py-0.5 text-[10px] font-bold bg-indigo-50 ${wh > 0 ? 'text-indigo-700' : 'text-gray-300'}`}>
                    {wh > 0 ? fmtH(wh) : ''}
                  </td>
                )
              })}
              <td className="sticky right-0 z-30 bg-gray-50 border-t border-l border-gray-100 px-1 py-0.5 text-center text-[10px] font-bold text-gray-700">
                {fmtH(Object.values(dayTotals).reduce((s, h) => s + h, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Legend */}
      <div className="shrink-0 flex items-center gap-4 px-4 py-1 border-t border-gray-100 bg-white text-[10px] text-gray-400">
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
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded outline outline-2 outline-emerald-400" />Sauvegardé</span>
        <span className="inline-flex items-center gap-1.5 text-blue-400"><span className="inline-block w-3 h-3 rounded" style={{ boxShadow: 'inset 0 0 0 2px #3b82f6' }} />Sélectionné</span>
        <span className="ml-auto">Clic = sélect · Shift+clic = plage · Ctrl+C/V = copier/coller</span>
      </div>

      {/* Modal intérimaire */}
      {showInterimModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowInterimModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Ajouter un intérimaire</h2>
            <div className="flex gap-0 border-b border-gray-200 mb-4">
              {(['select', 'create'] as const).map(m => (
                <button key={m} onClick={() => setInterimMode(m)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${interimMode === m ? 'border-slate-900 text-slate-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {m === 'select' ? 'Choisir existant' : 'Créer nouveau'}
                </button>
              ))}
            </div>
            {interimMode === 'select' && (
              <div className="space-y-4">
                {loadingAvailable ? (
                  <p className="text-sm text-gray-400">Chargement…</p>
                ) : availableInterims.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">Aucun intérimaire disponible dans la base.</p>
                ) : (
                  <select value={selectedExistingId} onChange={e => setSelectedExistingId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
                    <option value="">— Sélectionner —</option>
                    {availableInterims.map(e => (
                      <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
                    ))}
                  </select>
                )}
                <div className="flex justify-end gap-3">
                  <button onClick={() => setShowInterimModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">Annuler</button>
                  <button onClick={handleAddExistingInterim} disabled={!selectedExistingId || interimAdding}
                    className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50">
                    {interimAdding ? 'Ajout…' : 'Ajouter'}
                  </button>
                </div>
              </div>
            )}
            {interimMode === 'create' && (
              <div className="space-y-4">
                <input autoFocus value={newInterimLabel} onChange={e => setNewInterimLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddInterim(); if (e.key === 'Escape') setShowInterimModal(false) }}
                  placeholder="Nom de l'intérimaire ou agence…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
                <div className="flex justify-end gap-3">
                  <button onClick={() => setShowInterimModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">Annuler</button>
                  <button onClick={handleAddInterim} disabled={interimAdding || !newInterimLabel.trim()}
                    className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50">
                    {interimAdding ? 'Création…' : 'Créer et ajouter'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Conformité modal */}
      {showComplianceModal && complianceReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowComplianceModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Vérification de conformité</h2>
                <p className="text-xs text-gray-400 mt-0.5">{teamName} — {MONTHS_FR[month]} {year}</p>
              </div>
              <button onClick={() => setShowComplianceModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1 rounded">×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {complianceReport.totalAlerts === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-base font-semibold text-green-700">Planning conforme</p>
                  <p className="text-sm text-gray-400 mt-1">Aucune anomalie détectée</p>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">
                      {complianceReport.totalAlerts} anomalie{complianceReport.totalAlerts > 1 ? 's' : ''}
                    </span>
                    <span className="text-sm text-gray-500">
                      pour {complianceReport.totalEmployeesWithAlerts} salarié{complianceReport.totalEmployeesWithAlerts > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {complianceReport.perEmployee.map(({ employee, alerts }) => (
                      <div key={employee.id} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                          <span className="text-sm font-semibold text-gray-800">{employee.last_name} {employee.first_name}</span>
                          <span className="text-xs text-gray-400">{employee.contract_type}{employee.statut ? ` · ${employee.statut}` : ''}</span>
                        </div>
                        <div className="divide-y divide-gray-50">
                          {alerts.map((alert, idx) => (
                            <div key={idx} className={`flex items-start gap-3 px-4 py-2.5 ${alert.severity === 'red' ? 'bg-red-50' : 'bg-orange-50'}`}>
                              <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${alert.severity === 'red' ? 'bg-red-500' : 'bg-orange-400'}`} />
                              <div>
                                <div className={`text-xs font-semibold ${alert.severity === 'red' ? 'text-red-700' : 'text-orange-700'}`}>{alert.rule}</div>
                                <div className={`text-xs mt-0.5 ${alert.severity === 'red' ? 'text-red-600' : 'text-orange-600'}`}>{alert.detail}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="px-6 py-3 border-t border-gray-100 shrink-0 flex justify-end">
              <button onClick={() => setShowComplianceModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseDown={e => e.stopPropagation()} // prevent outside-click handler from closing immediately
        >
          <button
            onClick={() => { copySelected(); setContextMenu(null) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-gray-700 hover:bg-gray-50"
          >
            <span className="text-gray-400 text-xs font-mono">Ctrl+C</span>
            <span>Copier</span>
          </button>
          <button
            onClick={() => { pasteToSelected(); setContextMenu(null) }}
            disabled={!clipboard}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <span className="text-gray-400 text-xs font-mono">Ctrl+V</span>
            <span>Coller {clipboard ? <span className="font-mono text-blue-600 ml-1">({clipboard})</span> : ''}</span>
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={deleteSelected}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-red-600 hover:bg-red-50"
          >
            <span className="text-red-300 text-xs font-mono">Del</span>
            <span>Supprimer {contextMenu.keys.length > 1 ? `(${contextMenu.keys.length})` : ''}</span>
          </button>
        </div>
      )}
    </div>
  )
}
