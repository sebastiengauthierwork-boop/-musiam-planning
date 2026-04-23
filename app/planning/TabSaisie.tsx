'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { AbsenceCode, Employee, ShiftCode, TabProps } from './types'
import { decimalToHMin } from '@/lib/timeUtils'
import { generatePlanningPdf } from '@/lib/generatePlanningPdf'
import { getCodeColors, SHIFT_PALETTE, REPOS_COLOR, ABSENCE_COLOR } from '@/lib/codeColors'

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
  const suggestions = allCodes.filter(c => val.length === 0 || c.code.startsWith(val)).slice(0, 8)

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
        className="w-full h-6 text-center text-xs font-mono bg-transparent focus:outline-none uppercase rounded"
        maxLength={5}
      />

      {status === 'saving' && (
        <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse pointer-events-none" />
      )}
      {status === 'error' && (
        <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-red-500 pointer-events-none" />
      )}

      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 z-50 bg-white border border-gray-200 rounded-lg shadow-xl min-w-[240px] overflow-hidden">
          {suggestions.map(c => (
            <button
              key={c.code}
              onMouseDown={e => {
                e.preventDefault()
                if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
                setVal(c.code); onSave(c.code); setOpen(false)
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-blue-50 text-left"
            >
              <span className={`font-mono font-bold w-10 shrink-0 ${c.kind === 'shift' ? 'text-blue-600' : 'text-gray-500'}`}>{c.code}</span>
              <span className="text-gray-600 truncate flex-1">{c.label}</span>
              {c.kind === 'shift' && c.start_time && (
                <span className="text-gray-400 shrink-0">{c.start_time.slice(0, 5)}–{c.end_time?.slice(0, 5)}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type ContextMenu = { x: number; y: number; keys: string[] }

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

export default function TabSaisie({ employees, schedules, shiftCodes, absenceCodes, year, month, teamId, teamName, calendarDays, isArchived, archiveDate, onArchived, onRefresh }: TabProps) {
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
  const [showArchiveModal, setShowArchiveModal] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [archiveStep, setArchiveStep] = useState<'pdf' | 'saving' | null>(null)

  // ── Cycle modal ──
  const [showCycleModal, setShowCycleModal] = useState(false)
  const [cycleStartWeek, setCycleStartWeek] = useState(1)
  const [cycleStartDate, setCycleStartDate] = useState(`${year}-${String(month + 1).padStart(2, '0')}-01`)
  const [cycleEndDate, setCycleEndDate] = useState(() => toISO(new Date(year, month + 1, 0)))
  const [cycleOverwrite, setCycleOverwrite] = useState(false)
  const [cycleApplying, setCycleApplying] = useState(false)
  const [cycleResult, setCycleResult] = useState<{ filled: number; emps: number; kept: number; noData: number } | null>(null)

  // ── Intérimaires ──
  const [showAddInterim, setShowAddInterim] = useState(false)
  const [newInterimLabel, setNewInterimLabel] = useState('')
  const [interimAdding, setInterimAdding] = useState(false)

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
    setCellStatus(cur => ({ ...cur, [key]: 'saving' }))
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

  // ── Intérimaires ─────────────────────────────────────────────────────────
  async function handleAddInterim() {
    const label = newInterimLabel.trim()
    if (!label) return
    setInterimAdding(true)
    try {
      const { data: empData, error: empErr } = await supabase
        .from('employees')
        .insert({ first_name: label, last_name: '', email: null, contract_type: 'INTERIM', is_active: true, weekly_contract_hours: 35 })
        .select('id')
        .single()
      if (empErr) throw empErr
      const { error: etErr } = await supabase
        .from('employee_teams')
        .insert({ employee_id: empData.id, team_id: teamId, is_primary: false })
      if (etErr) throw etErr
      setNewInterimLabel('')
      setShowAddInterim(false)
      onRefresh?.()
    } catch (err: any) {
      setGlobalError(err?.message ?? 'Erreur lors de l\'ajout de l\'intérimaire')
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
      map[emp.id] = days.reduce((s, d) => s + getPaidHours(cellValues[`${emp.id}|${toISO(d)}`], shiftCodes, teamId), 0)
    }
    return map
  }, [cellValues, employees, days, shiftCodes, teamId])

  // ── Totaux journaliers par date
  const dayTotals = useMemo(() => {
    const map: Record<string, number> = {}
    for (const d of days) {
      const dateStr = toISO(d)
      map[dateStr] = employees.reduce((s, e) => s + getPaidHours(cellValues[`${e.id}|${dateStr}`], shiftCodes, teamId), 0)
    }
    return map
  }, [cellValues, employees, days, shiftCodes, teamId])

  function monthlyLimit(emp: Employee): number { return (emp.weekly_contract_hours ?? 35) * 52 / 12 }

  // ── Stats par jour (requis vs présents)
  function getDayStats(dateStr: string) {
    const structId = calStructureIdMap[dateStr] ?? null
    const positions = structId ? (structurePositions[structId] ?? []) : []
    const required = positions.reduce((s, p) => s + p.required_count, 0)
    const codeInTeam = (code: string) =>
      shiftCodes.some(s => s.code === code && (s.team_id === teamId || s.team_id === null))
    const presents = employees.filter(e => {
      const code = cellValues[`${e.id}|${dateStr}`]
      return code ? codeInTeam(code) : false
    }).length
    const byCode: Record<string, { required: number; actual: number }> = {}
    for (const p of positions) {
      byCode[p.position_name] = {
        required: p.required_count,
        actual: employees.filter(e => {
          const code = cellValues[`${e.id}|${dateStr}`]
          return code === p.position_name && codeInTeam(code)
        }).length,
      }
    }
    return { required, presents, ecart: presents - required, byCode, hasStructure: !!structId }
  }

  function dayPresents(dateStr: string): number {
    return employees.filter(e => {
      const code = cellValues[`${e.id}|${dateStr}`]
      return code ? shiftCodes.some(s => s.code === code && (s.team_id === teamId || s.team_id === null)) : false
    }).length
  }

  // Séparation principaux / renforts / intérimaires
  const primaryEmployees = employees.filter(e => e.is_primary !== false && e.contract_type !== 'INTERIM')
  const secondaryEmployees = employees.filter(e => e.is_primary === false && e.contract_type !== 'INTERIM')
  const interimEmployees = employees.filter(e => e.contract_type === 'INTERIM')

  return (
    <div className="flex flex-col h-full overflow-hidden">

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

      {/* Action bar: cycle + archive */}
      {!isArchived && (
        <div className="shrink-0 flex items-center justify-between px-4 py-1.5 border-b border-gray-100 bg-gray-50/60">
          <button onClick={() => { setCycleResult(null); setCycleStartWeek(1); setCycleOverwrite(false); setCycleStartDate(`${year}-${String(month + 1).padStart(2, '0')}-01`); setCycleEndDate(toISO(new Date(year, month + 1, 0))); setShowCycleModal(true) }}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-indigo-700 border border-indigo-200 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Appliquer le cycle
          </button>
          {year * 100 + month <= new Date().getFullYear() * 100 + new Date().getMonth() && (
            <button onClick={() => setShowArchiveModal(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-amber-700 border border-amber-200 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12" />
              </svg>
              Archiver le mois
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table ref={tableRef} className="border-collapse text-xs w-max min-w-full">
          <thead className="sticky top-0 z-20 bg-white">
            <tr>
              <th className="sticky left-0 z-30 bg-white border-b border-r border-gray-200 w-40 min-w-[160px] px-3 py-2 text-left text-gray-500 font-semibold text-xs uppercase tracking-wider">
                Employé
              </th>
              {days.map(d => {
                const isWE = d.getDay() === 0 || d.getDay() === 6
                const isMonday = d.getDay() === 1
                const isTo = toISO(d) === today
                const structName = calStructureMap[toISO(d)]
                return (
                  <th key={toISO(d)}
                    className="w-10 min-w-[40px] border-b border-r border-gray-200 py-1 text-center"
                    style={{ background: isWE ? '#e0e0e0' : undefined, ...(isMonday ? { borderLeft: '2px solid #6b7280' } : {}) }}>
                    {structName
                      ? <div className="text-[7px] text-violet-500 leading-none truncate px-0.5 mb-0.5">{structName.slice(0, 5)}</div>
                      : <div className="text-[10px] leading-none mb-0.5 invisible">·</div>
                    }
                    <div className={`text-[10px] ${isWE ? 'text-slate-500' : 'text-gray-400'}`}>{DAY_LETTER[d.getDay()]}</div>
                    <div className={`font-bold text-sm ${isTo ? 'text-blue-600' : isWE ? 'text-slate-600' : 'text-gray-700'}`}>{d.getDate()}</div>
                  </th>
                )
              })}
              {weeks.map(w => (
                <th key={w.label} className="w-14 min-w-[56px] border-b border-r border-indigo-200 bg-indigo-50 py-1.5 text-center text-indigo-600 font-bold text-xs">
                  {w.label}
                  <div className="text-[9px] font-normal text-indigo-400">{w.days.length}j</div>
                </th>
              ))}
              <th className="sticky right-0 z-30 bg-white border-b border-l border-gray-200 px-2 py-2 text-center text-gray-500 font-semibold text-xs uppercase tracking-wider w-16">
                Total
              </th>
            </tr>
            {/* ── Bandeau effectifs ── */}
            {/* Ligne résumée (toujours visible) */}
            <tr className={`border-b ${bandeauOpen ? 'border-indigo-100' : 'border-gray-100'}`}>
              <td className="sticky left-0 z-30 bg-white border-r border-gray-100 px-2 py-0.5 whitespace-nowrap">
                <button
                  onClick={() => setBandeauOpen(v => !v)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-900 transition-colors"
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
            {[...primaryEmployees, ...secondaryEmployees].map((emp, globalIdx) => {
              // Insert "Renforts" separator before first secondary employee
              const isFirstRenfort = emp.is_primary === false && (globalIdx === 0 || employees[globalIdx - 1]?.is_primary !== false)
              const monthH = empMonthlyTotals[emp.id] ?? 0
              const limit = monthlyLimit(emp)
              const over = monthH > limit + 0.5
              const isRenfort = emp.is_primary === false
              return (
                <Fragment key={emp.id}>
                  {isFirstRenfort && secondaryEmployees.length > 0 && (
                    <tr key="renforts-separator">
                      <td
                        colSpan={days.length + weeks.length + 2}
                        className="bg-gray-100 border-t border-b border-gray-200 px-4 py-1 text-[10px] font-semibold text-gray-500 uppercase tracking-widest text-center"
                      >
                        Renforts · {secondaryEmployees.length} salarié{secondaryEmployees.length > 1 ? 's' : ''} affecté{secondaryEmployees.length > 1 ? 's' : ''} en secondaire
                      </td>
                    </tr>
                  )}
                  <tr key={emp.id} className={`group ${isRenfort ? 'bg-gray-50/50 hover:bg-blue-50/10' : 'hover:bg-blue-50/20'}`}>
                    <td className={`sticky left-0 z-10 border-b border-r border-gray-100 px-3 py-0 h-6 whitespace-nowrap ${isRenfort ? 'bg-gray-50/80 group-hover:bg-blue-50/10' : 'bg-white group-hover:bg-blue-50/20'}`}>
                      {isRenfort && <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-300 mr-1.5 mb-0.5" />}
                      <span className={`font-semibold ${isRenfort ? 'text-gray-600' : 'text-gray-800'}`}>{emp.last_name}</span>{' '}
                      <span className="text-gray-500">{emp.first_name}</span>
                      {emp.fonction && <span className="ml-1.5 text-gray-400 text-[10px]">· {emp.fonction}</span>}
                    </td>
                    {days.map(d => {
                      const dateStr = toISO(d)
                      const isWE = d.getDay() === 0 || d.getDay() === 6
                      const isMonday = d.getDay() === 1
                      const key = `${emp.id}|${dateStr}`
                      const isSel = selected.has(key)
                      return (
                        <td key={dateStr} className="border-b border-r border-gray-100 p-0 h-6 relative"
                          style={isMonday ? { borderLeft: '2px solid #6b7280' } : undefined}>
                          {isArchived ? (
                            <div
                              className="w-full h-full flex items-center justify-center text-xs font-mono"
                              style={(() => {
                                const c = cellValues[key] ? getCodeColors(cellValues[key], shiftCodes, absenceCodes) : null
                                return c ? { background: c.bg, color: c.text } : { background: '#f8fafc' }
                              })()}
                            >
                              {cellValues[key] || ''}
                            </div>
                          ) : (
                            <CellInput
                              saved={cellValues[key] ?? ''}
                              status={cellStatus[key] ?? 'idle'}
                              errorMsg={cellErrors[key]}
                              shiftCodes={shiftCodes}
                              teamShiftCodes={teamShiftCodes}
                              absenceCodes={absenceCodes}
                              onSave={code => saveCell(emp.id, dateStr, code)}
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
                      const wh = w.days.reduce((s, d) => s + getPaidHours(cellValues[`${emp.id}|${toISO(d)}`], shiftCodes, teamId), 0)
                      const over35 = wh > 35.5
                      return (
                        <td key={w.label} className={`border-b border-r border-indigo-100 px-1 h-6 text-center text-xs font-semibold ${
                          over35 ? 'text-red-600 bg-red-50' : wh > 0 ? 'text-indigo-700 bg-indigo-50/50' : 'text-gray-200 bg-indigo-50/20'
                        }`}>
                          {wh > 0 ? fmtH(wh) : ''}
                        </td>
                      )
                    })}
                    <td className={`sticky right-0 z-10 border-b border-l border-gray-100 px-2 h-6 text-center font-semibold ${isRenfort ? 'bg-gray-50/80 group-hover:bg-blue-50/10' : 'bg-white group-hover:bg-blue-50/20'} ${over ? 'text-red-600' : 'text-gray-700'}`}>
                      {fmtH(monthH)}
                      {over && <span className="block text-[9px] font-normal text-red-400">/{fmtH(limit)}</span>}
                    </td>
                  </tr>
                </Fragment>
              )
            })}
          {/* ── Intérimaires ── */}
          {(!isArchived || interimEmployees.length > 0) && (
            <>
              <tr>
                <td
                  colSpan={days.length + weeks.length + 2}
                  className="bg-amber-50 border-t border-b border-amber-200 px-4 py-1 text-[10px] font-semibold text-amber-700 uppercase tracking-widest"
                >
                  <div className="flex items-center justify-between">
                    <span>Intérimaires{interimEmployees.length > 0 ? ` · ${interimEmployees.length}` : ''}</span>
                    {!isArchived && !showAddInterim && (
                      <button onClick={() => setShowAddInterim(true)}
                        className="text-amber-600 hover:text-amber-800 font-medium flex items-center gap-1">
                        + Ajouter
                      </button>
                    )}
                  </div>
                </td>
              </tr>

              {interimEmployees.map(emp => {
                const monthH = empMonthlyTotals[emp.id] ?? 0
                return (
                  <tr key={emp.id} className="group bg-amber-50/20 hover:bg-amber-50/50">
                    <td className="sticky left-0 z-10 border-b border-r border-amber-100 px-3 py-0 h-6 whitespace-nowrap bg-amber-50/30 group-hover:bg-amber-50/70">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-amber-800 text-xs">{emp.first_name || emp.last_name}</span>
                        {!isArchived && (
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
                      const key = `${emp.id}|${dateStr}`
                      const isSel = selected.has(key)
                      return (
                        <td key={dateStr} className="border-b border-r border-amber-100 p-0 h-6 relative"
                          style={isMonday ? { borderLeft: '2px solid #6b7280' } : undefined}>
                          {isArchived ? (
                            <div
                              className="w-full h-full flex items-center justify-center text-xs font-mono"
                              style={(() => {
                                const c = cellValues[key] ? getCodeColors(cellValues[key], shiftCodes, absenceCodes) : null
                                return c ? { background: c.bg, color: c.text } : {}
                              })()}
                            >
                              {cellValues[key] || ''}
                            </div>
                          ) : (
                            <CellInput
                              saved={cellValues[key] ?? ''}
                              status={cellStatus[key] ?? 'idle'}
                              errorMsg={cellErrors[key]}
                              shiftCodes={shiftCodes}
                              teamShiftCodes={teamShiftCodes}
                              absenceCodes={absenceCodes}
                              onSave={code => saveCell(emp.id, dateStr, code)}
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
                      const wh = w.days.reduce((s, d) => s + getPaidHours(cellValues[`${emp.id}|${toISO(d)}`], shiftCodes, teamId), 0)
                      return (
                        <td key={w.label} className={`border-b border-r border-amber-100 px-1 h-6 text-center text-xs font-semibold ${wh > 0 ? 'text-amber-700 bg-amber-50/50' : 'text-gray-200 bg-amber-50/20'}`}>
                          {wh > 0 ? fmtH(wh) : ''}
                        </td>
                      )
                    })}
                    <td className="sticky right-0 z-10 border-b border-l border-amber-100 px-2 h-6 text-center font-semibold bg-amber-50/30 group-hover:bg-amber-50/70 text-amber-800">
                      {fmtH(monthH)}
                    </td>
                  </tr>
                )
              })}

              {showAddInterim && !isArchived && (
                <tr>
                  <td colSpan={days.length + weeks.length + 2} className="border-b border-amber-200 px-3 py-2 bg-amber-50/60">
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={newInterimLabel}
                        onChange={e => setNewInterimLabel(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleAddInterim()
                          if (e.key === 'Escape') { setShowAddInterim(false); setNewInterimLabel('') }
                        }}
                        placeholder="Nom de l'intérimaire ou agence…"
                        className="flex-1 border border-amber-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                      />
                      <button onClick={handleAddInterim} disabled={interimAdding || !newInterimLabel.trim()}
                        className="px-3 py-1 text-xs font-medium bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50">
                        {interimAdding ? 'Ajout…' : 'Ajouter'}
                      </button>
                      <button onClick={() => { setShowAddInterim(false); setNewInterimLabel('') }}
                        className="px-3 py-1 text-xs font-medium border border-gray-300 text-gray-600 rounded hover:bg-gray-50">
                        Annuler
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </>
          )}
          </tbody>

          <tfoot className="sticky bottom-0 z-20 bg-gray-50">
            <tr>
              <td className="sticky left-0 z-30 bg-gray-50 border-t border-r border-gray-200 px-3 py-1.5 font-semibold text-gray-500 text-xs">
                Total équipe
              </td>
              {days.map(d => {
                const dateStr = toISO(d)
                const h = dayTotals[dateStr] ?? 0
                const isWE = d.getDay() === 0 || d.getDay() === 6
                const isMonday = d.getDay() === 1
                return (
                  <td key={dateStr}
                    className={`border-t border-r border-gray-200 text-center font-semibold py-1.5 ${isWE ? 'bg-slate-100 text-slate-400' : h > 0 ? 'text-gray-700' : 'text-gray-300'}`}
                    style={isMonday ? { borderLeft: '2px solid #6b7280' } : undefined}>
                    {h > 0 ? fmtH(h) : ''}
                  </td>
                )
              })}
              {weeks.map(w => {
                const wh = employees.reduce((s, e) =>
                  s + w.days.reduce((ss, d) => ss + getPaidHours(cellValues[`${e.id}|${toISO(d)}`], shiftCodes, teamId), 0), 0)
                return (
                  <td key={w.label} className={`border-t border-r border-indigo-200 text-center py-1.5 text-xs font-bold bg-indigo-50 ${wh > 0 ? 'text-indigo-700' : 'text-gray-300'}`}>
                    {wh > 0 ? fmtH(wh) : ''}
                  </td>
                )
              })}
              <td className="sticky right-0 z-30 bg-gray-50 border-t border-l border-gray-200 px-2 py-1.5 text-center font-bold text-gray-700">
                {fmtH(Object.values(dayTotals).reduce((s, h) => s + h, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
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
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded outline outline-2 outline-emerald-400" />Sauvegardé</span>
        <span className="inline-flex items-center gap-1.5 text-blue-400"><span className="inline-block w-3 h-3 rounded" style={{ boxShadow: 'inset 0 0 0 2px #3b82f6' }} />Sélectionné</span>
        <span className="ml-auto">Clic = sélect · Shift+clic = plage · Ctrl+C/V = copier/coller</span>
      </div>

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
