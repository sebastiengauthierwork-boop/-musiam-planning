'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSite } from '@/lib/site-context'
import { buildStructHoursMap, computeMonthBudget, fmtHMin } from '@/lib/budgetUtils'
import * as XLSX from 'xlsx'

// ─── Types ────────────────────────────────────────────────────────────────────

type TeamOption = { id: string; name: string; cdpf: string | null }
type Structure = { id: string; name: string; site_id?: string | null; team_id?: string | null }
type StructurePosition = { id: string; structure_id: string; position_name: string; required_count: number }
type PosLine = { code: string; required_count: string }
type ShiftCodeMin = { id: string; code: string; label: string; paid_hours: number | null; net_hours: number | null; start_time: string | null; end_time: string | null; break_minutes: number }
type GanttRow = {
  label: string; code: string
  start: string | null; end: string | null; breakMin: number
  paidH: number | null; colorIdx: number
}

// ─── Mini-composants UI ───────────────────────────────────────────────────────

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function ConfirmDelete({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal title="Confirmer la suppression" onClose={onCancel}>
      <p className="text-sm text-gray-600">Cette action est irréversible.</p>
      <div className="flex justify-end gap-3 mt-6">
        <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
        <button onClick={onConfirm} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">Supprimer</button>
      </div>
    </Modal>
  )
}

// ─── Gantt ────────────────────────────────────────────────────────────────────

const GANTT_COLORS = [
  { bg: '#bfdbfe', border: '#3b82f6', text: '#1e40af', light: '#eff6ff' },
  { bg: '#bbf7d0', border: '#22c55e', text: '#15803d', light: '#f0fdf4' },
  { bg: '#fde68a', border: '#f59e0b', text: '#78350f', light: '#fffbeb' },
  { bg: '#fecaca', border: '#ef4444', text: '#991b1b', light: '#fef2f2' },
  { bg: '#ddd6fe', border: '#8b5cf6', text: '#4c1d95', light: '#f5f3ff' },
  { bg: '#fed7aa', border: '#f97316', text: '#7c2d12', light: '#fff7ed' },
  { bg: '#a5f3fc', border: '#06b6d4', text: '#164e63', light: '#ecfeff' },
  { bg: '#fce7f3', border: '#ec4899', text: '#831843', light: '#fdf2f8' },
]
const G_START = 5
const G_END   = 23
const G_TOTAL = (G_END - G_START) * 60

function tMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function gPct(min: number): number {
  return Math.max(0, Math.min(100, (min - G_START * 60) / G_TOTAL * 100))
}

function GanttPanel({
  structure, positions, shiftCodes, onClose,
}: {
  structure: Structure
  positions: StructurePosition[]
  shiftCodes: ShiftCodeMin[]
  onClose: () => void
}) {
  const codeColor: Record<string, number> = {}
  let ci = 0
  for (const p of positions) {
    if (!(p.position_name in codeColor)) { codeColor[p.position_name] = ci % GANTT_COLORS.length; ci++ }
  }

  const rows: GanttRow[] = []
  for (const p of positions) {
    const sc = shiftCodes.find(c => c.code === p.position_name)
    for (let i = 1; i <= p.required_count; i++) {
      rows.push({
        label: p.required_count > 1 ? `${p.position_name} (${i})` : p.position_name,
        code: p.position_name,
        start: sc?.start_time?.slice(0, 5) ?? null,
        end:   sc?.end_time?.slice(0, 5)   ?? null,
        breakMin: sc?.break_minutes ?? 0,
        paidH: sc?.paid_hours != null ? Number(sc.paid_hours) : sc?.net_hours != null ? Number(sc.net_hours) : null,
        colorIdx: codeColor[p.position_name] ?? 0,
      })
    }
  }
  rows.sort((a, b) => (a.start ?? '99:99').localeCompare(b.start ?? '99:99'))

  const totalEffectif = positions.reduce((s, p) => s + p.required_count, 0)
  const totalH = positions.reduce((s, p) => {
    const sc = shiftCodes.find(c => c.code === p.position_name)
    return s + Number(sc?.paid_hours ?? sc?.net_hours ?? 0) * p.required_count
  }, 0)

  const hourMarkers = Array.from({ length: G_END - G_START + 1 }, (_, i) => G_START + i)
  const today = new Date().toLocaleDateString('fr-FR')

  function fmtHG(h: number) {
    return `${Math.floor(h)}h${h % 1 ? String(Math.round((h % 1) * 60)).padStart(2, '0') : ''}`
  }

  const uniquePos = positions.filter((p, i, arr) => arr.findIndex(x => x.position_name === p.position_name) === i)

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <style>{`
        @media screen { .gantt-print-header { display: none; } }
        @media print {
          .gantt-print-header { display: flex !important; }
          @page { size: A4 landscape; margin: 1.2cm; }
        }
      `}</style>

      <div className="no-print flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
          Diagramme de Gantt
        </span>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Imprimer / PDF
          </button>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="print-gantt-area p-5">
        <div className="gantt-print-header items-end justify-between border-b-2 border-gray-800 pb-3 mb-5">
          <div>
            <div style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#94a3b8' }}>
              MUSIAM · STRUCTURE DE STAFFING
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', marginTop: 2 }}>
              {structure.name}
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 9, color: '#64748b' }}>Édité le {today}</div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 700 }}>
            <div style={{ position: 'relative', marginLeft: 116, height: 18, marginBottom: 4 }}>
              {hourMarkers.map(h => (
                <div key={h} style={{
                  position: 'absolute',
                  left: `${(h - G_START) / (G_END - G_START) * 100}%`,
                  transform: 'translateX(-50%)',
                  fontSize: 9, color: '#94a3b8', fontFamily: 'monospace', whiteSpace: 'nowrap',
                }}>
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {rows.map((row, ri) => {
                const color = GANTT_COLORS[row.colorIdx]
                const hasTime = !!(row.start && row.end)
                const startMin = hasTime ? tMin(row.start!) : 0
                const endMin   = hasTime ? tMin(row.end!)   : 0
                const leftPct  = hasTime ? gPct(startMin)   : 0
                const rightPct = hasTime ? gPct(endMin)     : 0
                const widthPct = rightPct - leftPct
                const breakBarW = widthPct > 0 && row.breakMin > 0
                  ? (row.breakMin / G_TOTAL * 100) / widthPct * 100 : 0
                const breakBarL = (100 - breakBarW) / 2

                return (
                  <div key={ri} style={{ display: 'flex', alignItems: 'center', height: 30 }}>
                    <div style={{
                      width: 116, minWidth: 116, paddingRight: 8, textAlign: 'right',
                      fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: '#334155', flexShrink: 0,
                    }}>
                      {row.label}
                    </div>
                    <div style={{ flex: 1, position: 'relative', height: 24, borderLeft: '1px solid #e2e8f0' }}>
                      {hourMarkers.map((h, hi) => (
                        <div key={hi} style={{
                          position: 'absolute',
                          left: `${(h - G_START) / (G_END - G_START) * 100}%`,
                          top: 0, bottom: 0, width: 1,
                          background: hi % 2 === 0 ? '#f1f5f9' : '#f8fafc',
                          pointerEvents: 'none',
                        }} />
                      ))}
                      {hasTime ? (
                        <>
                          <div style={{
                            position: 'absolute',
                            left: `${leftPct}%`,
                            width: `${Math.max(widthPct, 0.5)}%`,
                            top: 2, bottom: 2,
                            background: color.bg,
                            border: `1.5px solid ${color.border}`,
                            borderRadius: 4,
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            paddingLeft: 6,
                          }}>
                            {breakBarW > 0 && (
                              <div style={{
                                position: 'absolute',
                                left: `${breakBarL}%`, width: `${breakBarW}%`,
                                top: 0, bottom: 0,
                                background: color.light,
                                borderLeft: `1.5px dashed ${color.border}`,
                                borderRight: `1.5px dashed ${color.border}`,
                                opacity: 0.9,
                              }} />
                            )}
                            <span style={{
                              fontSize: 10, fontWeight: 700, color: color.text,
                              position: 'relative', zIndex: 1, whiteSpace: 'nowrap',
                            }}>
                              {row.code} {row.start}–{row.end}
                            </span>
                          </div>
                          {row.paidH !== null && (
                            <div style={{
                              position: 'absolute',
                              left: `calc(${rightPct}% + 5px)`,
                              top: '50%', transform: 'translateY(-50%)',
                              fontSize: 10, fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap',
                            }}>
                              {fmtHG(row.paidH)}
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{
                          position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)',
                          fontSize: 10, color: '#cbd5e1', fontStyle: 'italic',
                        }}>
                          horaires non définis
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{
              marginTop: 14, paddingTop: 10, borderTop: '1px solid #e2e8f0',
              display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 16, fontSize: 11, color: '#64748b',
            }}>
              <span><strong style={{ color: '#1e293b' }}>{totalEffectif}</strong> personne{totalEffectif > 1 ? 's' : ''}</span>
              <span><strong style={{ color: '#1e293b' }}>{fmtHG(totalH)}</strong> heures totales</span>
              <div style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {uniquePos.map((p, pi) => {
                  const c = GANTT_COLORS[codeColor[p.position_name] ?? 0]
                  return (
                    <span key={pi} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ display: 'inline-block', width: 12, height: 12, background: c.bg, border: `1.5px solid ${c.border}`, borderRadius: 2 }} />
                      <span style={{ fontWeight: 700, color: c.text }}>{p.position_name}</span>
                    </span>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Structures ───────────────────────────────────────────────────────────────

export function Structures() {
  const { selectedSiteId } = useSite()
  const [structures, setStructures] = useState<Structure[]>([])
  const [positions, setPositions] = useState<StructurePosition[]>([])
  const [shiftCodes, setShiftCodes] = useState<ShiftCodeMin[]>([])
  const [teams, setTeams] = useState<TeamOption[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Structure | null>(null)
  const [name, setName] = useState('')
  const [posLines, setPosLines] = useState<PosLine[]>([{ code: '', required_count: '1' }])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function load() {
    let sQ = supabase.from('staffing_structures').select('id, name, site_id, team_id').order('name')
    if (selectedSiteId) sQ = sQ.eq('site_id', selectedSiteId)
    if (selectedTeamId) sQ = sQ.eq('team_id', selectedTeamId)
    let scQ = supabase.from('shift_codes').select('id, code, label, paid_hours, net_hours, start_time, end_time, break_minutes').order('code')
    if (selectedSiteId) scQ = scQ.eq('site_id', selectedSiteId)
    let tQ = supabase.from('teams').select('id, name, cdpf').order('name')
    if (selectedSiteId) tQ = tQ.eq('site_id', selectedSiteId)
    const [sRes, pRes, scRes, tRes] = await Promise.all([
      sQ,
      supabase.from('staffing_structure_positions').select('id, structure_id, position_name, required_count').order('position_name'),
      scQ,
      tQ,
    ])
    setStructures(sRes.data ?? [])
    setPositions(pRes.data ?? [])
    setShiftCodes(scRes.data ?? [])
    setTeams(tRes.data ?? [])
    setLoading(false)
  }
  useEffect(() => { setSelectedTeamId('') }, [selectedSiteId])
  useEffect(() => { load() }, [selectedSiteId, selectedTeamId])

  function lineHours(line: PosLine): number {
    const sc = shiftCodes.find(c => c.code === line.code)
    return Number(sc?.paid_hours ?? sc?.net_hours ?? 0)
  }

  function structureTotalH(pos: StructurePosition[]): number {
    return pos.reduce((sum, p) => {
      const sc = shiftCodes.find(c => c.code === p.position_name)
      return sum + Number(sc?.paid_hours ?? sc?.net_hours ?? 0) * p.required_count
    }, 0)
  }

  function formTotalH(): number {
    return posLines.reduce((sum, line) => sum + lineHours(line) * (parseInt(line.required_count) || 0), 0)
  }

  function openAdd() {
    setEditing(null); setName(''); setPosLines([{ code: '', required_count: '1' }]); setSaveError(null); setModal('add')
  }
  function openEdit(s: Structure) {
    setEditing(s); setName(s.name); setSaveError(null)
    const pos = positions.filter(p => p.structure_id === s.id)
    setPosLines(pos.length > 0 ? pos.map(p => ({ code: p.position_name, required_count: String(p.required_count) })) : [{ code: '', required_count: '1' }])
    setModal('edit')
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true); setSaveError(null)
    try {
      let sid: string
      if (editing) {
        const { error } = await supabase.from('staffing_structures').update({ name: name.trim() }).eq('id', editing.id)
        if (error) throw error
        sid = editing.id
        const { error: delErr } = await supabase.from('staffing_structure_positions').delete().eq('structure_id', editing.id)
        if (delErr) throw delErr
      } else {
        const { data, error } = await supabase.from('staffing_structures').insert({ name: name.trim(), site_id: selectedSiteId || null, team_id: selectedTeamId || null }).select('id').single()
        if (error) throw error
        if (!data) throw new Error('Aucune donnée retournée — vérifiez que la table staffing_structures existe et que les RLS autorisent INSERT.')
        sid = data.id
      }
      const validPos = posLines.filter(p => p.code)
      if (validPos.length > 0) {
        const { error: posErr } = await supabase.from('staffing_structure_positions').insert(
          validPos.map(p => ({ structure_id: sid, position_name: p.code, required_count: parseInt(p.required_count) || 1 }))
        )
        if (posErr) throw posErr
      }
      setModal(null); await load()
    } catch (e: any) {
      setSaveError(e?.message ?? e?.details ?? JSON.stringify(e))
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    await supabase.from('staffing_structures').delete().eq('id', id)
    setDeletingId(null); await load()
  }

  function fmtH(h: number): string {
    if (h === 0) return '0h'
    return `${Math.floor(h)}h${h % 1 ? String(Math.round((h % 1) * 60)).padStart(2, '0') : ''}`
  }

  if (loading) return <div className="text-sm text-gray-400 py-4">Chargement…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-gray-900">
            Structures de staffing <span className="text-gray-400 font-normal text-sm">({structures.length})</span>
          </h2>
          {teams.length > 0 && (
            <select
              value={selectedTeamId}
              onChange={e => setSelectedTeamId(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="">Toutes les équipes</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}{t.cdpf ? ` (${t.cdpf})` : ''}</option>)}
            </select>
          )}
        </div>
        <button onClick={openAdd} className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Ajouter
        </button>
      </div>

      <div className="space-y-3">
        {structures.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-8 text-center text-gray-400 text-sm">
            Aucune structure. Créez-en une pour définir les besoins en effectif par jour.
          </div>
        )}
        {structures.map(s => {
          const pos = positions.filter(p => p.structure_id === s.id)
          const totalH = structureTotalH(pos)
          const isExpanded = expandedId === s.id
          return (
            <div key={s.id}>
              <div className={`bg-white rounded-xl border px-4 py-3 transition-colors ${isExpanded ? 'border-indigo-200' : 'border-gray-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : s.id)}
                    className="flex items-center gap-2 flex-1 text-left min-w-0 group"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 shrink-0 transition-transform duration-150"
                      style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors">{s.name}</span>
                    {totalH > 0 && (
                      <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full shrink-0">
                        {fmtH(totalH)} total
                      </span>
                    )}
                    {pos.length > 0 && (
                      <span className="text-[10px] text-gray-400 ml-1 hidden group-hover:inline">
                        Cliquer pour voir le Gantt
                      </span>
                    )}
                  </button>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button onClick={() => openEdit(s)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => setDeletingId(s.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
                {pos.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {pos.map(p => {
                      const sc = shiftCodes.find(c => c.code === p.position_name)
                      const h = Number(sc?.paid_hours ?? sc?.net_hours ?? 0)
                      return (
                        <span key={p.id} className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 text-blue-800 rounded text-xs font-mono font-bold">
                          {p.position_name}
                          <span className="font-normal text-blue-500">×{p.required_count}</span>
                          {h > 0 && <span className="font-normal text-blue-400">= {fmtH(h * p.required_count)}</span>}
                        </span>
                      )
                    })}
                  </div>
                ) : (
                  <span className="text-xs text-gray-400">Aucun code horaire défini</span>
                )}
              </div>

              {isExpanded && (
                <GanttPanel
                  structure={s}
                  positions={pos}
                  shiftCodes={shiftCodes}
                  onClose={() => setExpandedId(null)}
                />
              )}
            </div>
          )
        })}
      </div>

      {modal && (
        <Modal title={editing ? 'Modifier la structure' : 'Nouvelle structure de staffing'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <Field label="Nom de la structure *">
              <input value={name} onChange={e => setName(e.target.value)} className="input" placeholder="Ex: Ouverture Standard" autoFocus />
            </Field>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Codes horaires requis</label>

              <div className="grid grid-cols-[1fr_80px_80px_28px] gap-2 mb-1 px-1">
                <div className="text-[11px] text-gray-400 font-medium">Code horaire</div>
                <div className="text-[11px] text-gray-400 font-medium text-center">Effectif</div>
                <div className="text-[11px] text-gray-400 font-medium text-center">Heures</div>
                <div />
              </div>

              <div className="space-y-2">
                {posLines.map((line, i) => {
                  const sc = shiftCodes.find(c => c.code === line.code)
                  const h = Number(sc?.paid_hours ?? sc?.net_hours ?? 0)
                  const count = parseInt(line.required_count) || 0
                  const lineTotal = h * count
                  return (
                    <div key={i} className="grid grid-cols-[1fr_80px_80px_28px] gap-2 items-center">
                      <select
                        value={line.code}
                        onChange={e => setPosLines(prev => prev.map((x, j) => j === i ? { ...x, code: e.target.value } : x))}
                        className="input text-sm font-mono"
                      >
                        <option value="">— sélectionner —</option>
                        {shiftCodes.map(sc => (
                          <option key={sc.id} value={sc.code}>
                            {sc.code} · {sc.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={line.required_count}
                        onChange={e => setPosLines(prev => prev.map((x, j) => j === i ? { ...x, required_count: e.target.value } : x))}
                        className="input text-center"
                        min={1} max={20}
                      />
                      <div className="text-center text-xs font-mono">
                        {sc && h > 0 ? (
                          <span className={lineTotal > 0 ? 'text-emerald-600 font-semibold' : 'text-gray-400'}>
                            {lineTotal > 0 ? fmtH(lineTotal) : fmtH(h)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </div>
                      <button onClick={() => setPosLines(prev => prev.filter((_, j) => j !== i))}
                        className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  )
                })}

                <button
                  onClick={() => setPosLines(prev => [...prev, { code: '', required_count: '1' }])}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 mt-1"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Ajouter un code horaire
                </button>
              </div>

              {posLines.some(l => l.code) && (
                <div className="mt-3 flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                  <div className="text-xs text-indigo-500 font-medium">
                    {posLines.filter(l => l.code).map((l, i) => {
                      const sc = shiftCodes.find(c => c.code === l.code)
                      const h = Number(sc?.paid_hours ?? sc?.net_hours ?? 0)
                      const n = parseInt(l.required_count) || 0
                      return h > 0 && n > 0 ? `${l.code} ×${n} = ${fmtH(h * n)}` : null
                    }).filter(Boolean).join('  ·  ')}
                  </div>
                  <div className="text-sm font-bold text-indigo-700 shrink-0 ml-4">
                    Total {fmtH(formTotalH())}
                  </div>
                </div>
              )}
            </div>
          </div>

          {saveError && (
            <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 break-all">{saveError}</div>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setModal(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
            <button onClick={handleSave} disabled={saving || !name.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </Modal>
      )}
      {deletingId && <ConfirmDelete onConfirm={() => handleDelete(deletingId)} onCancel={() => setDeletingId(null)} />}
    </div>
  )
}

// ─── Calendrier ───────────────────────────────────────────────────────────────

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const STRUCT_COLORS = [
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-violet-100 text-violet-700 border-violet-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-rose-100 text-rose-700 border-rose-200',
  'bg-teal-100 text-teal-700 border-teal-200',
  'bg-orange-100 text-orange-700 border-orange-200',
]

export function Calendrier() {
  const now = new Date()
  const { selectedSiteId } = useSite()
  const [year, setYear] = useState(now.getFullYear())
  const [teamId, setTeamId] = useState<string>('')
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([])
  const [structures, setStructures] = useState<Structure[]>([])
  const [calMap, setCalMap] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(true)
  const [pendingDate, setPendingDate] = useState<string | null>(null)
  const [popoverMonth, setPopoverMonth] = useState<number | null>(null)
  const [positions, setPositions] = useState<StructurePosition[]>([])
  const [shiftCodeHours, setShiftCodeHours] = useState<Record<string, number>>({})
  const [showFill, setShowFill] = useState(false)
  const [fillStructId, setFillStructId] = useState<string>('')
  const [fillFrom, setFillFrom] = useState<string>(`${now.getFullYear()}-01-01`)
  const [fillTo, setFillTo] = useState<string>(`${now.getFullYear()}-12-31`)
  const [fillDays, setFillDays] = useState([true, true, true, true, true, true, true])
  const [filling, setFilling] = useState(false)

  const colorOf = (id: string) => STRUCT_COLORS[structures.findIndex(s => s.id === id) % STRUCT_COLORS.length] ?? STRUCT_COLORS[0]

  const structHoursMap = useMemo(() => buildStructHoursMap(positions, shiftCodeHours), [positions, shiftCodeHours])
  const allMonthBudgets = useMemo(
    () => Array.from({ length: 12 }, (_, m) => computeMonthBudget(calMap, structHoursMap, year, m)),
    [calMap, structHoursMap, year]
  )
  const annualBudget = useMemo(() => allMonthBudgets.reduce((s, v) => s + v, 0), [allMonthBudgets])

  function toISO(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  function getISOWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  }

  useEffect(() => {
    setLoading(true)
    let tQ = supabase.from('teams').select('id, name, cdpf').order('name')
    if (selectedSiteId) tQ = tQ.eq('site_id', selectedSiteId)
    let sQ = supabase.from('staffing_structures').select('id, name').order('name')
    if (selectedSiteId) sQ = sQ.eq('site_id', selectedSiteId)
    Promise.all([tQ, sQ]).then(([tRes, sRes]) => {
      const tList = tRes.data ?? []
      setTeams(tList)
      setStructures(sRes.data ?? [])
      setTeamId(tList[0]?.id ?? '')
      if (!tList.length) setLoading(false)
    })
  }, [selectedSiteId])

  useEffect(() => {
    if (!teamId) return
    setLoading(true)
    Promise.all([
      supabase.from('annual_calendar')
        .select('date, structure_id')
        .eq('team_id', teamId)
        .gte('date', `${year}-01-01`)
        .lte('date', `${year}-12-31`),
      supabase.from('staffing_structure_positions')
        .select('id, structure_id, position_name, required_count'),
      supabase.from('shift_codes')
        .select('code, paid_hours'),
    ]).then(([calRes, posRes, scRes]) => {
      const map: Record<string, string | null> = {}
      for (const c of (calRes.data ?? [])) map[c.date] = c.structure_id
      setCalMap(map)
      setPositions(posRes.data ?? [])
      const scHours: Record<string, number> = {}
      for (const sc of scRes.data ?? []) {
        if (sc.code && !(sc.code in scHours)) scHours[sc.code] = Number(sc.paid_hours ?? 0)
      }
      setShiftCodeHours(scHours)
      setLoading(false)
    })
  }, [teamId, year])

  async function assign(date: string, structureId: string | null) {
    if (!teamId) return
    if (structureId) {
      setCalMap(prev => ({ ...prev, [date]: structureId }))
      await supabase.from('annual_calendar').upsert(
        { date, team_id: teamId, structure_id: structureId },
        { onConflict: 'date,team_id' }
      )
    } else {
      await supabase.from('annual_calendar').delete().eq('date', date).eq('team_id', teamId)
      setCalMap(prev => { const n = { ...prev }; delete n[date]; return n })
    }
    setPendingDate(null)
  }

  async function applyFill() {
    if (!fillStructId || !fillFrom || !fillTo || !teamId) return
    setFilling(true)
    const rows: { date: string; team_id: string; structure_id: string }[] = []
    const cur = new Date(fillFrom + 'T00:00:00')
    const end = new Date(fillTo + 'T00:00:00')
    while (cur <= end) {
      const dow = (cur.getDay() + 6) % 7
      if (fillDays[dow]) rows.push({ date: toISO(cur), team_id: teamId, structure_id: fillStructId })
      cur.setDate(cur.getDate() + 1)
    }
    if (rows.length > 0) {
      await supabase.from('annual_calendar').upsert(rows, { onConflict: 'date,team_id' })
      setCalMap(prev => {
        const n = { ...prev }
        for (const r of rows) n[r.date] = r.structure_id
        return n
      })
    }
    setFilling(false)
    setShowFill(false)
  }

  function exportBudgetExcel() {
    const teamName = teams.find(t => t.id === teamId)?.name ?? 'Equipe'
    const sheetName = `Budget heures ${year}`.slice(0, 31)
    const headers = ['Jour', ...MONTHS_FR, 'TOTAL ANNUEL']
    const rows: (string | number | null)[][] = []
    for (let day = 1; day <= 31; day++) {
      const row: (string | number | null)[] = [day]
      let rowTotal = 0
      for (let m = 0; m < 12; m++) {
        const nDays = new Date(year, m + 1, 0).getDate()
        if (day > nDays) {
          row.push(null)
        } else {
          const dateStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const structId = calMap[dateStr]
          const h = structId ? (structHoursMap[structId] ?? 0) : 0
          row.push(h)
          rowTotal += h
        }
      }
      row.push(rowTotal)
      rows.push(row)
    }
    const totalRow: (string | number)[] = ['TOTAL', ...allMonthBudgets, annualBudget]
    const aoa = [headers, ...rows, totalRow]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 6 }, ...Array(12).fill({ wch: 11 }), { wch: 14 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    XLSX.writeFile(wb, `Budget_Heures_${teamName.replace(/\s+/g, '_')}_${year}.xlsx`)
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 1 + i)
  const DAY_LABELS_LONG = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
  const DAY_LABELS_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

  if (loading) return <div className="text-sm text-gray-400 py-4">Chargement…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Calendrier annuel</h2>
          <p className="text-xs text-gray-400 mt-0.5">Cliquez sur un jour pour lui affecter une structure de staffing</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={teamId} onChange={e => setTeamId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-200">
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-200">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={exportBudgetExcel}
            className="inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Exporter Excel
          </button>
          <button onClick={() => setShowFill(v => !v)}
            className={`inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${showFill ? 'bg-indigo-700 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Remplissage rapide
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {structures.map((s, i) => (
          <span key={s.id} className={`px-2 py-0.5 rounded border text-xs font-medium ${STRUCT_COLORS[i % STRUCT_COLORS.length]}`}>{s.name}</span>
        ))}
        {structures.length === 0 && <span className="text-xs text-gray-400">Créez d'abord des structures</span>}
      </div>

      {showFill && (
        <div className="mb-6 bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-indigo-900 mb-3">Remplissage rapide par règle</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-indigo-700 mb-1">Structure à appliquer</label>
              <select value={fillStructId} onChange={e => setFillStructId(e.target.value)} className="input text-sm">
                <option value="">— choisir —</option>
                {structures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-indigo-700 mb-1">Date de début</label>
              <input type="date" value={fillFrom} onChange={e => setFillFrom(e.target.value)} className="input text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-indigo-700 mb-1">Date de fin</label>
              <input type="date" value={fillTo} onChange={e => setFillTo(e.target.value)} className="input text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-indigo-700 mb-1">Jours de la semaine</label>
              <div className="flex flex-wrap gap-1">
                {DAY_LABELS_LONG.map((d, i) => (
                  <button key={i} type="button"
                    onClick={() => setFillDays(prev => prev.map((v, j) => j === i ? !v : v))}
                    className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${fillDays[i] ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-300 hover:border-indigo-300'}`}>
                    {d.slice(0, 2)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-indigo-600 italic">
              La règle écrase les assignations existantes pour les jours concernés. Appliquez plusieurs règles à la suite pour combiner.
            </p>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setShowFill(false)}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={applyFill} disabled={filling || !fillStructId || !fillFrom || !fillTo || !fillDays.some(Boolean)}
                className="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {filling ? 'Application…' : 'Appliquer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4" id="cal-grid">
        {Array.from({ length: 12 }, (_, m) => {
          const nDays = new Date(year, m + 1, 0).getDate()
          const firstDow = (new Date(year, m, 1).getDay() + 6) % 7
          const mBudget = allMonthBudgets[m]
          return (
            <div key={m}
              onClick={() => setPopoverMonth(m)}
              className="bg-white rounded-xl border border-gray-200 hover:border-gray-300 p-3 cursor-pointer transition-colors">
              <div className="flex items-baseline gap-1.5 mb-2">
                <span className="text-xs font-semibold text-gray-700">{MONTHS_FR[m]}</span>
                <span className="text-gray-200">|</span>
                {mBudget > 0 ? (
                  <>
                    <span className="text-[10px] font-semibold text-indigo-700 tabular-nums">{fmtHMin(mBudget)}</span>
                    <span className="text-[10px] text-gray-400">budget</span>
                  </>
                ) : (
                  <span className="text-[10px] text-gray-300">— h budget</span>
                )}
              </div>
              <div className="grid grid-cols-7 gap-px">
                {['L', 'Ma', 'Me', 'J', 'V', 'S', 'D'].map(d => (
                  <div key={d} className="text-[9px] text-center text-gray-400 font-medium pb-1">{d}</div>
                ))}
                {Array.from({ length: firstDow }, (_, i) => <div key={`e-${i}`} />)}
                {Array.from({ length: nDays }, (_, i) => {
                  const d = new Date(year, m, i + 1)
                  const dateStr = toISO(d)
                  const sId = calMap[dateStr] ?? null
                  const isWE = d.getDay() === 0 || d.getDay() === 6
                  const isPending = pendingDate === dateStr
                  const baseClass = sId ? colorOf(sId) : (isWE ? 'bg-slate-100 text-slate-400' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600')
                  return (
                    <div key={dateStr} className="relative">
                      <div
                        onClick={e => { e.stopPropagation(); setPendingDate(isPending ? null : dateStr) }}
                        className={`text-[10px] text-center py-0.5 rounded cursor-pointer font-medium transition-colors ${baseClass} ${isPending ? 'ring-2 ring-slate-400' : ''}`}
                        title={sId ? structures.find(s => s.id === sId)?.name : undefined}
                      >
                        {i + 1}
                      </div>
                      {isPending && (
                        <div onClick={e => e.stopPropagation()} className="absolute top-full left-1/2 -translate-x-1/2 z-50 bg-white border border-gray-200 rounded-lg shadow-xl min-w-[150px] py-1 mt-0.5">
                          <div className="px-2 py-1 text-[10px] text-gray-400 font-medium border-b border-gray-100">{dateStr}</div>
                          {structures.map(s => (
                            <button key={s.id} onMouseDown={e => { e.preventDefault(); assign(dateStr, s.id) }}
                              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${sId === s.id ? 'font-semibold text-blue-600' : 'text-gray-700'}`}>
                              {s.name}
                            </button>
                          ))}
                          {sId && (
                            <button onMouseDown={e => { e.preventDefault(); assign(dateStr, null) }}
                              className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 border-t border-gray-100 mt-0.5">
                              Effacer
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex items-center justify-between px-1">
        <span className="text-xs text-gray-400">Total annuel {year}</span>
        <span className="text-sm font-bold text-gray-700 tabular-nums">
          {annualBudget > 0 ? `${fmtHMin(annualBudget)} budget` : '—'}
        </span>
      </div>

      {popoverMonth !== null && (() => {
        const pm = popoverMonth
        const nDays = new Date(year, pm + 1, 0).getDate()
        const weekGroups = new Map<number, { label: string; h: number }[]>()
        for (let d = 1; d <= nDays; d++) {
          const date = new Date(year, pm, d)
          const structId = calMap[toISO(date)]
          const h = structId ? (structHoursMap[structId] ?? 0) : 0
          const w = getISOWeek(date)
          const label = `${DAY_LABELS_SHORT[date.getDay()]} ${String(d).padStart(2, '0')}/${String(pm + 1).padStart(2, '0')}`
          if (!weekGroups.has(w)) weekGroups.set(w, [])
          weekGroups.get(w)!.push({ label, h })
        }
        const sortedWeeks = [...weekGroups.entries()].sort((a, b) => a[0] - b[0])
        const monthTotal = sortedWeeks.reduce((s, [, days]) => s + days.reduce((ss, d) => ss + d.h, 0), 0)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setPopoverMonth(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-96 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
                <h3 className="text-sm font-bold text-gray-900">{MONTHS_FR[pm]} {year} — Budget heures</h3>
                <button onClick={() => setPopoverMonth(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>
              <div className="overflow-y-auto px-5 py-3 space-y-4">
                {sortedWeeks.map(([w, days]) => {
                  const weekTotal = days.reduce((s, d) => s + d.h, 0)
                  return (
                    <div key={w}>
                      <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">Semaine {w}</div>
                      <div className="space-y-0.5">
                        {days.map(day => (
                          <div key={day.label} className="flex items-baseline justify-between">
                            <span className="text-xs text-gray-500 w-24">{day.label}</span>
                            <span className={`text-xs tabular-nums ${day.h > 0 ? 'text-gray-700' : 'text-gray-300'}`}>{fmtHMin(day.h)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-baseline justify-between mt-1 pt-1 border-t border-gray-100">
                        <span className="text-xs text-gray-400">Sous-total</span>
                        <span className="text-xs font-bold text-gray-700 tabular-nums">{fmtHMin(weekTotal)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center justify-between px-5 py-3 border-t-2 border-gray-200 shrink-0 bg-gray-50 rounded-b-2xl">
                <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Total {MONTHS_FR[pm]}</span>
                <span className="text-base font-bold text-gray-900 tabular-nums">{fmtHMin(monthTotal)}</span>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
