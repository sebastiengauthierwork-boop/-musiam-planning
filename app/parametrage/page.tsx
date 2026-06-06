'use client'

export const dynamic = 'force-dynamic'

import { Fragment, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { decimalToHMin, hMinToDecimal } from '@/lib/timeUtils'
import ImportExcel from '@/components/ImportExcel'
import { teamLabel } from '@/lib/teamUtils'
import { useSite } from '@/lib/site-context'
import { useAuth } from '@/lib/auth'
import { isAdmin, isSuperAdmin, getCodeColor } from '@/lib/utils'
import { usePermissions } from '@/lib/permissions'

// ─── Types ────────────────────────────────────────────────────────────────────

type ShiftCode = {
  id: string; code: string; label: string
  team_id: string | null; team_prefix: string | null; location_prefix: string | null
  arrival_time: string | null; start_time: string | null; end_time: string | null; departure_time: string | null
  break_minutes: number; pause_minutes: number; dressing_minutes: number
  net_hours: number | null; target_hours: number | null; paid_hours: number | null
  meal_included: boolean; color?: string | null
}
type AbsenceCode = { id: string; code: string; label: string; is_paid: boolean; color?: string | null }
type JobFunction = { id: string; name: string; code: string | null; is_active: boolean }

type ShiftForm = {
  code: string; label: string
  paid_hours: string
  start_time: string
  break_minutes: string
  dressing_minutes: string
  meal_included: boolean
  end_time: string; arrival_time: string; departure_time: string
  color: string
  // nomenclature auto-générée
  nomenStatut: '' | 'E' | 'M' | 'C'
  nomenEquipeId: string
  nomenHoraire: string
  nomenSuffixe: string
}

type NomenTeam = { id: string; name: string; letter: string | null; site_id: string | null }
type AbsenceForm = { code: string; label: string; is_paid: boolean; color: string }

const emptyShiftForm: ShiftForm = {
  code: '', label: '',
  paid_hours: '', start_time: '',
  break_minutes: '0', dressing_minutes: '0',
  meal_included: false,
  end_time: '', arrival_time: '', departure_time: '',
  color: '',
  nomenStatut: '', nomenEquipeId: '', nomenHoraire: '', nomenSuffixe: '',
}
const emptyAbsenceForm: AbsenceForm = { code: '', label: '', is_paid: true, color: '' }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tMinP(t: string): number {
  if (!t) return -1
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function mToTimeP(m: number): string {
  const total = ((m % 1440) + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// Recalcule end/arrival/departure depuis les champs principaux
// paid_hours saisi en h:min (ex: "7h48"), habillage en minutes
function recalcShiftTimes(form: ShiftForm): Pick<ShiftForm, 'end_time' | 'arrival_time' | 'departure_time'> {
  const ph = hMinToDecimal(form.paid_hours)
  const startMin = tMinP(form.start_time)
  const breakMin = parseInt(form.break_minutes) || 0
  const dressMin = parseInt(form.dressing_minutes) || 0
  if (ph <= 0 || startMin < 0) return { end_time: '', arrival_time: '', departure_time: '' }
  // travail effectif = heures payées − habillage total
  const effectiveMin = Math.round(ph * 60) - dressMin
  const endMin = startMin + effectiveMin + (form.meal_included ? breakMin : 0)
  return {
    end_time: mToTimeP(endMin),
    arrival_time: mToTimeP(startMin - Math.round(dressMin / 2)),
    departure_time: mToTimeP(endMin + Math.round(dressMin / 2)),
  }
}

function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60)
  const min = m % 60
  return h > 0 ? `${h}h${String(min).padStart(2, '0')}` : `${min}min`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-600">
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
      {hint && <p className="text-xs text-gray-600 mt-1">{hint}</p>}
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

function autoText(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return '#000000'
  const lum = (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) / 255
  return lum > 0.5 ? '#000000' : '#ffffff'
}

// ─── Codes Horaires ───────────────────────────────────────────────────────────

function CodesHoraires() {
  const { selectedSiteId } = useSite()
  const [codes, setCodes] = useState<ShiftCode[]>([])
  const [nomenTeams, setNomenTeams] = useState<NomenTeam[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<ShiftCode | null>(null)
  const [form, setForm] = useState<ShiftForm>(emptyShiftForm)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [ignoreColorConflict, setIgnoreColorConflict] = useState(false)
  const [showBulkColor, setShowBulkColor] = useState(false)
  const [bulkColor, setBulkColor] = useState('#4A90C4')
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  const [bulkApplying, setBulkApplying] = useState(false)
  const [bulkResult, setBulkResult] = useState<string | null>(null)

  async function load() {
    let q = supabase.from('shift_codes').select('id, code, label, team_id, team_prefix, location_prefix, arrival_time, start_time, end_time, departure_time, break_minutes, pause_minutes, dressing_minutes, net_hours, target_hours, paid_hours, meal_included, color').order('code')
    if (selectedSiteId) q = q.eq('site_id', selectedSiteId)
    const [codesRes, teamsRes] = await Promise.all([
      q,
      supabase.from('teams').select('id, name, letter, site_id').order('name').limit(200),
    ])
    setCodes(codesRes.data ?? [])
    const allTeams: NomenTeam[] = teamsRes.data ?? []
    setNomenTeams(selectedSiteId ? allTeams.filter(t => t.site_id === selectedSiteId) : allTeams)
    setLoading(false)
  }
  useEffect(() => { load() }, [selectedSiteId])

  function openAdd() {
    setEditing(null); setForm(emptyShiftForm); setSaveError(null); setIgnoreColorConflict(false); setModal('add')
  }

  function shiftToForm(c: ShiftCode): ShiftForm {
    const base: ShiftForm = {
      code: c.code,
      label: c.label,
      paid_hours: c.paid_hours != null ? decimalToHMin(c.paid_hours) : '',
      start_time: c.start_time?.slice(0, 5) ?? '',
      break_minutes: String(c.break_minutes ?? 0),
      dressing_minutes: String(c.dressing_minutes ?? 0),
      meal_included: c.meal_included ?? false,
      end_time: c.end_time?.slice(0, 5) ?? '',
      arrival_time: c.arrival_time?.slice(0, 5) ?? '',
      departure_time: c.departure_time?.slice(0, 5) ?? '',
      color: (c as any).color ?? '',
      nomenStatut: '', nomenEquipeId: '', nomenHoraire: '', nomenSuffixe: '',
    }
    return { ...base, ...recalcShiftTimes(base) }
  }

  function openEdit(c: ShiftCode) {
    setEditing(c); setForm(shiftToForm(c)); setSaveError(null); setIgnoreColorConflict(false); setModal('edit')
  }

  function openDuplicate(c: ShiftCode) {
    setEditing(null); setForm({ ...shiftToForm(c), code: '', color: '' }); setSaveError(null); setIgnoreColorConflict(false); setModal('add')
  }

  async function handleBulkColor() {
    if (bulkSelected.size === 0 || !bulkColor) return
    setBulkApplying(true); setBulkResult(null)
    const ids = codes.filter(c => bulkSelected.has(c.code)).map(c => c.id)
    await supabase.from('shift_codes').update({ color: bulkColor }).in('id', ids)
    await load()
    setBulkResult(`Couleur appliquée à ${ids.length} code${ids.length > 1 ? 's' : ''}`)
    setBulkApplying(false)
  }

  const STATUT_LABELS: Record<string, string> = { E: 'Employé', M: 'Manager', C: 'Cadre' }
  const HORAIRE_LABELS: Record<string, string> = { O: 'Ouverture', F: 'Fermeture', M: 'Milieu', J: 'Journée', P: 'Polyvalent' }

  function teamLetter(t: NomenTeam): string {
    return t.letter || t.name.slice(0, 2).toUpperCase()
  }

  function updateForm(f: Partial<ShiftForm>) {
    setForm(prev => {
      const next = { ...prev, ...f }
      const isNomenChange = 'nomenStatut' in f || 'nomenEquipeId' in f || 'nomenHoraire' in f || 'nomenSuffixe' in f
      if (isNomenChange) {
        // nomenEquipeId holds the letter directly (option value = letter)
        const letter = next.nomenEquipeId
        const team = nomenTeams.find(t => t.letter === letter)
        next.code = (next.nomenStatut + letter + next.nomenHoraire + next.nomenSuffixe).toUpperCase()
        const labelParts = [
          next.nomenStatut ? STATUT_LABELS[next.nomenStatut] : '',
          team?.name ?? '',
          next.nomenHoraire ? (HORAIRE_LABELS[next.nomenHoraire] ?? next.nomenHoraire) : '',
        ].filter(Boolean)
        if (labelParts.length > 0) next.label = labelParts.join(' ')
      }
      return { ...next, ...recalcShiftTimes(next) }
    })
  }

  // Vérification doublon code en temps réel
  const codeConflict = form.code.trim()
    ? codes.some(c => c.code === form.code.trim().toUpperCase() && (!editing || c.id !== editing.id))
    : false

  const colorConflictCode = form.color && !ignoreColorConflict
    ? (codes.find(c => (c as any).color === form.color && (!editing || c.id !== editing.id)) ?? null)
    : null

  const isCadre = form.nomenStatut === 'C'

  async function handleSave() {
    if (!form.code || !form.label) return
    if (!isCadre && !editing && (!form.paid_hours || !form.start_time)) {
      setSaveError('Heures payées et prise de poste sont requises (sauf pour les cadres).')
      return
    }
    setSaving(true); setSaveError(null)
    const ph = form.paid_hours ? hMinToDecimal(form.paid_hours) : null
    const dressMin = parseInt(form.dressing_minutes) || 0
    const payload = {
      code: form.code.trim().toUpperCase(),
      label: form.label.trim(),
      site_id: selectedSiteId || null,
      team_id: null,
      team_prefix: null,
      location_prefix: null,
      paid_hours: ph,
      target_hours: ph,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      arrival_time: form.arrival_time || null,
      departure_time: form.departure_time || null,
      break_minutes: parseInt(form.break_minutes) || 0,
      dressing_minutes: dressMin,
      pause_minutes: 0,
      meal_included: form.meal_included,
      color: form.color || null,
    }
    try {
      if (editing) {
        const { error } = await supabase.from('shift_codes').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('shift_codes').insert(payload)
        if (error) throw error
      }
      setModal(null); await load()
    } catch (e: any) {
      setSaveError(e?.message ?? e?.details ?? JSON.stringify(e))
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    await supabase.from('shift_codes').delete().eq('id', id)
    setDeletingId(null); await load()
  }

  // Aperçu du code tel qu'il apparaîtra sur le planning
  const previewBadge = form.code
    ? `${form.code}${form.start_time ? ' ' + form.start_time : ''}${form.end_time ? ' → ' + form.end_time : ''}`
    : null

  if (loading) return <div className="text-sm text-gray-600 py-4">Chargement…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">
          Codes horaires <span className="text-gray-600 font-normal text-sm">({codes.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          <ImportExcel
            label="codes horaires"
            templateFilename="modele_codes_horaires.xlsx"
            columns={[
              { key: 'code', label: 'Code', required: true, example: 'EOS', aliases: ['code horaire'] },
              { key: 'label', label: 'Label', required: true, example: 'Employé Ouverture Salon', aliases: ['libelle', 'description', 'intitule'] },
              { key: 'start_time', label: 'Prise de poste', example: '05:00', aliases: ['debut poste', 'heure debut', 'debut', 'heure prise'] },
              { key: 'end_time', label: 'Fin de poste', example: '13:00', aliases: ['fin poste', 'heure fin', 'fin'] },
              { key: 'paid_hours', label: 'Heures payées', required: true, example: '7.50', aliases: ['heures payees', 'h payees', 'heures', 'duree'] },
              { key: 'break_minutes', label: 'Pause repas (min)', example: '30', aliases: ['pause repas', 'pause', 'coupure'] },
              { key: 'dressing_minutes', label: 'Habillage (min)', example: '10', aliases: ['habillage', 'deshabillage'] },
              { key: 'meal_included', label: 'Repas inclus', example: 'Non', dropdown: ['Oui', 'Non'], aliases: ['repas', 'repas inclus', 'avantage repas'] },
              { key: 'color', label: 'Couleur (hex)', example: '#5BA55B', aliases: ['couleur', 'hex', 'color'] },
            ]}
            onParse={rows => {
              const valid: any[] = []; const errors: string[] = []
              function parseTime(s: string | null): string | null {
                if (!s) return null
                const clean = String(s).trim().replace(/[h]/i, ':')
                if (/^\d{3,4}$/.test(clean.replace(':', ''))) {
                  const t = clean.replace(':', '').padStart(4, '0')
                  return `${t.slice(0,2)}:${t.slice(2,4)}`
                }
                if (/^\d{1,2}:\d{2}$/.test(clean)) return clean.padStart(5, '0')
                return null
              }
              rows.forEach((r: any, i) => {
                const code = r.code ? String(r.code).trim().toUpperCase() : ''
                const label = r.label ? String(r.label).trim() : ''
                if (!code || !label) { errors.push(`Ligne ${i+2} : code et label requis`); return }
                const mealRaw = String(r.meal_included ?? '').toLowerCase().trim()
                valid.push({
                  code,
                  label,
                  start_time: parseTime(r.start_time),
                  end_time: parseTime(r.end_time),
                  paid_hours: r.paid_hours ? String(r.paid_hours) : null,
                  break_minutes: r.break_minutes ? parseInt(String(r.break_minutes)) || 0 : 0,
                  dressing_minutes: r.dressing_minutes ? parseInt(String(r.dressing_minutes)) || 0 : 0,
                  meal_included: ['oui', 'true', '1', 'yes'].includes(mealRaw),
                  color: r.color ? String(r.color).trim() : null,
                })
              })
              return { valid, errors }
            }}
            onImport={async rows => {
              for (const r of rows) {
                const ph = r.paid_hours ? hMinToDecimal(String(r.paid_hours)) : null
                await supabase.from('shift_codes').upsert({
                  code: String(r.code),
                  label: String(r.label),
                  site_id: selectedSiteId || null,
                  team_id: null,
                  paid_hours: ph,
                  target_hours: ph,
                  start_time: r.start_time || null,
                  end_time: r.end_time || null,
                  break_minutes: (r.break_minutes as number) || 0,
                  dressing_minutes: (r.dressing_minutes as number) || 0,
                  meal_included: r.meal_included as boolean,
                  pause_minutes: 0,
                  ...(r.color ? { color: String(r.color) } : {}),
                }, { onConflict: 'code,site_id' })
              }
              await load()
            }}
          />
          <button onClick={() => { setShowBulkColor(true); setBulkSelected(new Set()); setBulkResult(null) }}
            className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 text-sm font-medium px-3 py-2 rounded-lg transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>
            Appliquer une couleur
          </button>
          <button onClick={openAdd} className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Ajouter
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {['Code', 'Label', 'Arrivée', 'Prise de poste', 'Fin de poste', 'Départ', 'Repas', 'Habill.', 'Pause repas', 'Payées'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">{h}</th>
              ))}
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {codes.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-600">Aucun code horaire</td></tr>
            )}
            {codes.map(c => {
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5">
                    {(() => { const clr = getCodeColor(c.code, [c]); return (
                      <span className="font-mono font-bold px-2 py-0.5 rounded text-xs" style={{ background: clr.bg, color: clr.text }}>
                        {c.code}
                      </span>
                    )})()}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700 max-w-[180px] truncate">{c.label}</td>
                  <td className="px-3 py-2.5 text-gray-600 font-mono text-xs">{c.arrival_time?.slice(0, 5) ?? '—'}</td>
                  <td className="px-3 py-2.5 text-gray-700 font-mono text-xs font-semibold">{c.start_time?.slice(0, 5) ?? '—'}</td>
                  <td className="px-3 py-2.5 text-gray-700 font-mono text-xs font-semibold">{c.end_time?.slice(0, 5) ?? '—'}</td>
                  <td className="px-3 py-2.5 text-gray-600 font-mono text-xs">{c.departure_time?.slice(0, 5) ?? '—'}</td>
                  <td className="px-3 py-2.5 text-gray-700 text-xs">{c.break_minutes}min</td>
                  <td className="px-3 py-2.5 text-gray-700 text-xs">{c.dressing_minutes}min</td>
                  <td className="px-3 py-2.5 text-center text-xs">
                    {c.meal_included ? <span className="text-emerald-600 font-bold">✓</span> : <span className="text-gray-700">—</span>}
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-emerald-700 text-xs">
                    {c.paid_hours != null ? decimalToHMin(c.paid_hours) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openDuplicate(c)} title="Dupliquer" className="p-1.5 text-gray-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <button onClick={() => openEdit(c)} title="Modifier" className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => setDeletingId(c.id)} title="Supprimer" className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          title={editing ? 'Modifier le code horaire' : form.label ? 'Dupliquer → nouveau code' : 'Nouveau code horaire'}
          onClose={() => setModal(null)}
        >
          <div className="space-y-4">
            {/* Nomenclature automatique — mode ajout uniquement */}
            {!editing && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Génération automatique du code</p>
                <div className="grid grid-cols-4 gap-2">
                  <Field label="Statut">
                    <select value={form.nomenStatut} onChange={e => updateForm({ nomenStatut: e.target.value as ShiftForm['nomenStatut'] })} className="input text-xs">
                      <option value="">—</option>
                      <option value="E">E – Employé</option>
                      <option value="M">M – Manager</option>
                      <option value="C">C – Cadre</option>
                    </select>
                  </Field>
                  <Field label="Équipe">
                    <select value={form.nomenEquipeId} onChange={e => updateForm({ nomenEquipeId: e.target.value })} className="input text-xs">
                      <option value="">—</option>
                      {nomenTeams.filter(t => t.letter).map(t => (
                        <option key={t.id} value={t.letter!}>{t.letter} – {t.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Horaire" hint="Ex : O, F, M, N, J, P…">
                    <input
                      value={form.nomenHoraire}
                      onChange={e => updateForm({ nomenHoraire: e.target.value.toUpperCase().slice(0, 2) })}
                      className="input font-mono text-xs"
                      placeholder="O"
                      maxLength={2}
                    />
                  </Field>
                  <Field label="Suffixe">
                    <input value={form.nomenSuffixe} onChange={e => updateForm({ nomenSuffixe: e.target.value.toUpperCase().slice(0, 1) })}
                      className="input font-mono text-xs" placeholder="2" maxLength={1} />
                  </Field>
                </div>
              </div>
            )}

            {/* Code + Label */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Code *" hint={codeConflict ? undefined : 'Pré-rempli ou saisissez manuellement'}>
                <input value={form.code} onChange={e => updateForm({ code: e.target.value.toUpperCase() })}
                  className={`input font-mono ${codeConflict ? 'border-red-400 focus:ring-red-300' : ''}`}
                  maxLength={10} placeholder="ETO" autoFocus disabled={!!editing} />
                {codeConflict && <p className="text-xs text-red-600 mt-1">Ce code existe déjà sur ce site</p>}
              </Field>
              <Field label="Label *">
                <input value={form.label} onChange={e => updateForm({ label: e.target.value })}
                  className="input" placeholder="Bibliothèque Matin" />
              </Field>
            </div>

            {/* Couleur personnalisée */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Couleur de fond (optionnel)</label>
              <div className="flex items-center gap-3">
                <input type="color" value={form.color || '#4A90C4'}
                  onChange={e => { updateForm({ color: e.target.value }); setIgnoreColorConflict(false) }}
                  className="h-9 w-14 rounded border border-gray-300 cursor-pointer p-0.5" />
                {form.color && (
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-md font-mono font-bold text-sm"
                    style={{ background: form.color, color: (() => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(form.color); if (!m) return '#000'; const lum = (0.299*parseInt(m[1],16)+0.587*parseInt(m[2],16)+0.114*parseInt(m[3],16))/255; return lum>0.5?'#000000':'#ffffff' })() }}>
                    {form.code || 'CODE'}
                  </span>
                )}
                {form.color && (
                  <button type="button" onClick={() => { updateForm({ color: '' }); setIgnoreColorConflict(false) }}
                    className="text-xs text-gray-600 hover:text-red-500 underline">Supprimer</button>
                )}
              </div>
              {colorConflictCode && (
                <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                  <p>Cette couleur est déjà utilisée par le code <strong>{colorConflictCode.code}</strong> ({colorConflictCode.label}). Voulez-vous quand même l'utiliser ?</p>
                  <div className="flex gap-2 mt-2">
                    <button type="button" onClick={() => updateForm({ color: '' })}
                      className="px-3 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Changer de couleur</button>
                    <button type="button" onClick={() => setIgnoreColorConflict(true)}
                      className="px-3 py-1 text-xs font-medium text-amber-800 bg-amber-100 border border-amber-300 rounded-lg hover:bg-amber-200">Utiliser quand même</button>
                  </div>
                </div>
              )}
            </div>

            {/* d) Heures nettes + e) Prise de poste — champs principaux */}
            <div className="grid grid-cols-2 gap-4">
              <Field
                label={form.nomenStatut === 'C' ? 'Heures payées' : 'Heures payées *'}
                hint={form.nomenStatut === 'C' ? 'Optionnel pour les cadres' : 'Saisir en h:min — ex : 7h48 ou 7:48'}
              >
                <input type="text" value={form.paid_hours}
                  onChange={e => updateForm({ paid_hours: e.target.value })}
                  className="input font-mono text-lg font-semibold" placeholder="7h48" />
              </Field>
              <Field
                label={form.nomenStatut === 'C' ? 'Prise de poste' : 'Prise de poste *'}
                hint={form.nomenStatut === 'C' ? 'Optionnel pour les cadres' : 'Heure de début de travail effectif'}
              >
                <input type="time" value={form.start_time}
                  onChange={e => updateForm({ start_time: e.target.value })}
                  className="input font-mono text-lg font-semibold" />
              </Field>
            </div>

            {/* f) Repas + g) Habillage + h) Repas inclus */}
            <div className="grid grid-cols-3 gap-4 items-start">
              <Field label="Temps de pause repas (min)" hint="Inclus dans le temps de présence si 'Pause repas' activé">
                <input type="number" value={form.break_minutes}
                  onChange={e => updateForm({ break_minutes: e.target.value })}
                  className="input" min={0} step={5} />
              </Field>
              <Field label="Habillage total (min)" hint="Total habillage + déshabillage (divisé par 2)">
                <input type="number" value={form.dressing_minutes}
                  onChange={e => updateForm({ dressing_minutes: e.target.value })}
                  className="input" min={0} step={2} />
              </Field>
              <Field label="Pause repas">
                <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                  <input type="checkbox" checked={form.meal_included}
                    onChange={e => updateForm({ meal_included: e.target.checked })}
                    className="rounded border-gray-300 text-slate-900 w-4 h-4" />
                  <span className="text-sm text-gray-700">Oui, pause repas</span>
                </label>
              </Field>
            </div>

            {/* Champs calculés (lecture seule) */}
            {(form.end_time || form.arrival_time) && (
              <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3">
                <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-2">Calculé automatiquement</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[10px] text-gray-600 mb-0.5">Arrivée salarié</p>
                    <input readOnly value={form.arrival_time} className="input bg-gray-100 text-gray-700 font-mono cursor-not-allowed" tabIndex={-1} />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-600 mb-0.5">Fin de poste</p>
                    <input readOnly value={form.end_time} className="input bg-blue-50 text-blue-700 font-mono font-semibold cursor-not-allowed" tabIndex={-1} />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-600 mb-0.5">Départ salarié</p>
                    <input readOnly value={form.departure_time} className="input bg-gray-100 text-gray-700 font-mono cursor-not-allowed" tabIndex={-1} />
                  </div>
                </div>
              </div>
            )}

            {/* Aperçu */}
            {previewBadge && (
              <div className="rounded-lg bg-slate-900 px-4 py-2.5 flex items-center gap-3">
                <span className="text-xs text-slate-400">Aperçu planning :</span>
                <span className="font-mono font-bold text-white bg-blue-600 px-2 py-0.5 rounded text-sm">
                  {previewBadge}
                </span>
                {form.paid_hours && (
                  <span className="text-xs text-slate-300 ml-auto">
                    {form.paid_hours} payées
                    {parseInt(form.break_minutes) > 0 && ` · ${form.break_minutes}min pause repas`}
                    {parseInt(form.dressing_minutes) > 0 && ` · ${fmtMinutes(Math.round(parseInt(form.dressing_minutes) / 2))} habill.`}
                  </span>
                )}
              </div>
            )}
          </div>

          {saveError && (
            <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{saveError}</div>
          )}
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setModal(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
            <button onClick={handleSave} disabled={saving || !form.code || !form.label || codeConflict}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </Modal>
      )}
      {deletingId && <ConfirmDelete onConfirm={() => handleDelete(deletingId)} onCancel={() => setDeletingId(null)} />}

      {showBulkColor && (
        <Modal title="Appliquer une couleur en masse" onClose={() => setShowBulkColor(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Couleur à appliquer</label>
              <div className="flex items-center gap-3">
                <input type="color" value={bulkColor} onChange={e => setBulkColor(e.target.value)}
                  className="h-9 w-14 rounded border border-gray-300 cursor-pointer p-0.5" />
                <span className="inline-flex items-center px-3 py-1 rounded-md font-mono font-bold text-sm"
                  style={{ background: bulkColor, color: autoText(bulkColor) }}>
                  Aperçu
                </span>
                <span className="text-xs text-gray-600 font-mono">{bulkColor}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {['M', 'E', 'C'].map(prefix => (
                <button key={prefix} type="button"
                  onClick={() => setBulkSelected(new Set(codes.filter(c => c.code.startsWith(prefix)).map(c => c.code)))}
                  className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                  Codes {prefix}…
                </button>
              ))}
              <button type="button"
                onClick={() => setBulkSelected(new Set(codes.map(c => c.code)))}
                className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                Tous
              </button>
              <button type="button"
                onClick={() => setBulkSelected(new Set())}
                className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                Aucun
              </button>
              <span className="ml-auto text-xs text-gray-700 font-medium">{bulkSelected.size} code{bulkSelected.size !== 1 ? 's' : ''} sélectionné{bulkSelected.size !== 1 ? 's' : ''}</span>
            </div>
            <div className="border border-gray-200 rounded-lg overflow-y-auto max-h-64">
              {codes.map(c => (
                <label key={c.code} className="flex items-center gap-3 px-3 py-1.5 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0">
                  <input type="checkbox" checked={bulkSelected.has(c.code)}
                    onChange={e => setBulkSelected(prev => { const next = new Set(prev); e.target.checked ? next.add(c.code) : next.delete(c.code); return next })}
                    className="rounded border-gray-300 text-slate-900" />
                  <span className="font-mono font-bold px-2 py-0.5 rounded text-xs"
                    style={{ background: (c as any).color || '#e5e7eb', color: autoText((c as any).color || '#e5e7eb') }}>
                    {c.code}
                  </span>
                  <span className="text-xs text-gray-600 truncate">{c.label}</span>
                </label>
              ))}
            </div>
            {bulkResult && (
              <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{bulkResult}</p>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setShowBulkColor(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Fermer</button>
            <button onClick={handleBulkColor} disabled={bulkApplying || bulkSelected.size === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50">
              {bulkApplying ? 'Application…' : `Appliquer la couleur aux ${bulkSelected.size} code${bulkSelected.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Codes Absence ────────────────────────────────────────────────────────────

function CodesAbsence() {
  const [codes, setCodes] = useState<AbsenceCode[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<AbsenceCode | null>(null)
  const [form, setForm] = useState<AbsenceForm>(emptyAbsenceForm)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [ignoreColorConflictAbs, setIgnoreColorConflictAbs] = useState(false)
  const [showBulkColorAbs, setShowBulkColorAbs] = useState(false)
  const [bulkColorAbs, setBulkColorAbs] = useState('#888888')
  const [bulkSelectedAbs, setBulkSelectedAbs] = useState<Set<string>>(new Set())
  const [bulkApplyingAbs, setBulkApplyingAbs] = useState(false)
  const [bulkResultAbs, setBulkResultAbs] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase.from('absence_codes').select('id, code, label, is_paid, color').order('code')
    setCodes(data ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const colorConflictAbs = form.color && !ignoreColorConflictAbs
    ? (codes.find(c => (c as any).color === form.color && (!editing || c.id !== editing.id)) ?? null)
    : null

  function openAdd() { setEditing(null); setForm(emptyAbsenceForm); setSaveError(null); setIgnoreColorConflictAbs(false); setModal('add') }
  function openEdit(c: AbsenceCode) {
    setEditing(c)
    setForm({ code: c.code, label: c.label, is_paid: c.is_paid, color: (c as any).color ?? '' })
    setSaveError(null); setIgnoreColorConflictAbs(false); setModal('edit')
  }

  async function handleBulkColorAbs() {
    if (bulkSelectedAbs.size === 0 || !bulkColorAbs) return
    setBulkApplyingAbs(true); setBulkResultAbs(null)
    const ids = codes.filter(c => bulkSelectedAbs.has(c.code)).map(c => c.id)
    await supabase.from('absence_codes').update({ color: bulkColorAbs }).in('id', ids)
    await load()
    setBulkResultAbs(`Couleur appliquée à ${ids.length} code${ids.length > 1 ? 's' : ''}`)
    setBulkApplyingAbs(false)
  }

  async function handleSave() {
    if (!form.code || !form.label) return
    setSaving(true); setSaveError(null)
    const payload = { code: form.code.trim().toUpperCase(), label: form.label.trim(), is_paid: form.is_paid, color: form.color || null }
    try {
      if (editing) {
        const { error } = await supabase.from('absence_codes').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('absence_codes').insert(payload)
        if (error) throw error
      }
      setModal(null); await load()
    } catch (e: any) {
      setSaveError(e?.message ?? e?.details ?? JSON.stringify(e))
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    await supabase.from('absence_codes').delete().eq('id', id)
    setDeletingId(null); await load()
  }

  if (loading) return <div className="text-sm text-gray-600 py-4">Chargement…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">Codes absence <span className="text-gray-600 font-normal text-sm">({codes.length})</span></h2>
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowBulkColorAbs(true); setBulkSelectedAbs(new Set()); setBulkResultAbs(null) }}
            className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 text-sm font-medium px-3 py-2 rounded-lg transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>
            Appliquer une couleur
          </button>
          <ImportExcel
            label="codes absence"
            templateFilename="modele_codes_absence.xlsx"
            columns={[
              { key: 'code', label: 'Code', required: true, example: 'CP', aliases: ['code absence'] },
              { key: 'label', label: 'Label', required: true, example: 'Congés payés', aliases: ['libelle', 'description', 'intitule'] },
              { key: 'is_paid', label: 'Payé', example: 'Oui', dropdown: ['Oui', 'Non'], aliases: ['paye', 'remunere', 'remuneration'] },
              { key: 'counts_as_worked', label: 'Compte comme travaillé', example: 'Non', dropdown: ['Oui', 'Non'], aliases: ['travaille', 'comme travaille'] },
            ]}
            onParse={rows => {
              const valid: any[] = []; const errors: string[] = []
              rows.forEach((r: any, i) => {
                const code = r.code ? String(r.code).trim().toUpperCase() : ''
                const label = r.label ? String(r.label).trim() : ''
                if (!code || !label) { errors.push(`Ligne ${i+2} : code et label requis`); return }
                const isPaidRaw = String(r.is_paid ?? '').toLowerCase().trim()
                const countsRaw = String(r.counts_as_worked ?? '').toLowerCase().trim()
                valid.push({
                  code,
                  label,
                  is_paid: ['oui', 'true', '1', 'yes'].includes(isPaidRaw) ? true : !isPaidRaw ? true : false,
                  counts_as_worked: ['oui', 'true', '1', 'yes'].includes(countsRaw),
                })
              })
              return { valid, errors }
            }}
            onImport={async rows => {
              for (const r of rows) {
                await supabase.from('absence_codes').upsert({
                  code: String(r.code),
                  label: String(r.label),
                  is_paid: r.is_paid as boolean,
                  counts_as_worked: r.counts_as_worked as boolean,
                }, { onConflict: 'code' })
              }
              await load()
            }}
          />
          <button onClick={openAdd} className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Ajouter
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Code</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Label</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Payé</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {codes.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-600">Aucun code absence</td></tr>}
            {codes.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  {(() => { const clr = getCodeColor(c.code, [], [c]); return (
                    <span className="font-mono font-bold px-2 py-0.5 rounded text-sm" style={{ background: clr.bg, color: clr.text }}>{c.code}</span>
                  )})()}
                </td>
                <td className="px-4 py-2.5 text-gray-700">{c.label}</td>
                <td className="px-4 py-2.5">
                  {c.is_paid
                    ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700">Oui</span>
                    : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">Non</span>}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5 justify-end">
                    <button onClick={() => openEdit(c)} className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => setDeletingId(c.id)} className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={editing ? 'Modifier le code absence' : 'Nouveau code absence'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <Field label="Code *" hint="Ex: CP, RTT, MAL…">
              <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                className="input font-mono" maxLength={10} placeholder="CP" autoFocus disabled={!!editing} />
            </Field>
            <Field label="Label *">
              <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                className="input" placeholder="Congé payé" />
            </Field>
            <Field label="Rémunéré ?">
              <div className="flex gap-3 mt-1">
                {[true, false].map(v => (
                  <label key={String(v)} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="is_paid" checked={form.is_paid === v} onChange={() => setForm(f => ({ ...f, is_paid: v }))} className="text-slate-900" />
                    <span className="text-sm text-gray-700">{v ? 'Oui' : 'Non'}</span>
                  </label>
                ))}
              </div>
            </Field>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Couleur de fond (optionnel)</label>
              <div className="flex items-center gap-3">
                <input type="color" value={form.color || '#888888'}
                  onChange={e => { setForm(f => ({ ...f, color: e.target.value })); setIgnoreColorConflictAbs(false) }}
                  className="h-9 w-14 rounded border border-gray-300 cursor-pointer p-0.5" />
                {form.color && (
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-md font-mono font-bold text-sm"
                    style={{ background: form.color, color: (() => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(form.color); if (!m) return '#000'; const lum = (0.299*parseInt(m[1],16)+0.587*parseInt(m[2],16)+0.114*parseInt(m[3],16))/255; return lum>0.5?'#000000':'#ffffff' })() }}>
                    {form.code || 'CODE'}
                  </span>
                )}
                {form.color && (
                  <button type="button" onClick={() => { setForm(f => ({ ...f, color: '' })); setIgnoreColorConflictAbs(false) }}
                    className="text-xs text-gray-600 hover:text-red-500 underline">Supprimer</button>
                )}
              </div>
              {colorConflictAbs && (
                <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                  <p>Cette couleur est déjà utilisée par le code <strong>{colorConflictAbs.code}</strong> ({colorConflictAbs.label}). Voulez-vous quand même l'utiliser ?</p>
                  <div className="flex gap-2 mt-2">
                    <button type="button" onClick={() => setForm(f => ({ ...f, color: '' }))}
                      className="px-3 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Changer de couleur</button>
                    <button type="button" onClick={() => setIgnoreColorConflictAbs(true)}
                      className="px-3 py-1 text-xs font-medium text-amber-800 bg-amber-100 border border-amber-300 rounded-lg hover:bg-amber-200">Utiliser quand même</button>
                  </div>
                </div>
              )}
            </div>
          </div>
          {saveError && (
            <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{saveError}</div>
          )}
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setModal(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
            <button onClick={handleSave} disabled={saving || !form.code || !form.label}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </Modal>
      )}
      {deletingId && <ConfirmDelete onConfirm={() => handleDelete(deletingId)} onCancel={() => setDeletingId(null)} />}

      {showBulkColorAbs && (
        <Modal title="Appliquer une couleur en masse" onClose={() => setShowBulkColorAbs(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Couleur à appliquer</label>
              <div className="flex items-center gap-3">
                <input type="color" value={bulkColorAbs} onChange={e => setBulkColorAbs(e.target.value)}
                  className="h-9 w-14 rounded border border-gray-300 cursor-pointer p-0.5" />
                <span className="inline-flex items-center px-3 py-1 rounded-md font-mono font-bold text-sm"
                  style={{ background: bulkColorAbs, color: autoText(bulkColorAbs) }}>
                  Aperçu
                </span>
                <span className="text-xs text-gray-600 font-mono">{bulkColorAbs}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button"
                onClick={() => setBulkSelectedAbs(new Set(codes.map(c => c.code)))}
                className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                Tous
              </button>
              <button type="button"
                onClick={() => setBulkSelectedAbs(new Set())}
                className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                Aucun
              </button>
              <span className="ml-auto text-xs text-gray-700 font-medium">{bulkSelectedAbs.size} code{bulkSelectedAbs.size !== 1 ? 's' : ''} sélectionné{bulkSelectedAbs.size !== 1 ? 's' : ''}</span>
            </div>
            <div className="border border-gray-200 rounded-lg overflow-y-auto max-h-64">
              {codes.map(c => (
                <label key={c.code} className="flex items-center gap-3 px-3 py-1.5 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0">
                  <input type="checkbox" checked={bulkSelectedAbs.has(c.code)}
                    onChange={e => setBulkSelectedAbs(prev => { const next = new Set(prev); e.target.checked ? next.add(c.code) : next.delete(c.code); return next })}
                    className="rounded border-gray-300 text-slate-900" />
                  <span className="font-mono font-bold px-2 py-0.5 rounded text-sm"
                    style={{ background: (c as any).color || '#e5e7eb', color: autoText((c as any).color || '#e5e7eb') }}>
                    {c.code}
                  </span>
                  <span className="text-xs text-gray-600 truncate">{c.label}</span>
                </label>
              ))}
            </div>
            {bulkResultAbs && (
              <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{bulkResultAbs}</p>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setShowBulkColorAbs(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Fermer</button>
            <button onClick={handleBulkColorAbs} disabled={bulkApplyingAbs || bulkSelectedAbs.size === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50">
              {bulkApplyingAbs ? 'Application…' : `Appliquer la couleur aux ${bulkSelectedAbs.size} code${bulkSelectedAbs.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Fonctions ────────────────────────────────────────────────────────────────

function Fonctions() {
  const [functions, setFunctions] = useState<JobFunction[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<JobFunction | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase.from('job_functions').select('id, name, code, is_active').order('name')
    setFunctions(data ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  function openAdd() { setEditing(null); setName(''); setCode(''); setSaveError(null); setModal('add') }
  function openEdit(f: JobFunction) { setEditing(f); setName(f.name); setCode(f.code ?? ''); setSaveError(null); setModal('edit') }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true); setSaveError(null)
    const payload = { name: name.trim(), code: code.trim().toUpperCase().slice(0, 5) || null }
    try {
      if (editing) {
        const { error } = await supabase.from('job_functions').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('job_functions').insert(payload)
        if (error) throw error
      }
      setModal(null); await load()
    } catch (e: any) { setSaveError(e?.message ?? JSON.stringify(e)) } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('job_functions').delete().eq('id', id)
    if (error) { setSaveError(error.message); return }
    setDeletingId(null); await load()
  }

  async function toggleActive(f: JobFunction) {
    await supabase.from('job_functions').update({ is_active: !f.is_active }).eq('id', f.id)
    await load()
  }

  if (loading) return <div className="text-sm text-gray-600 py-4">Chargement…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">
          Fonctions <span className="text-gray-600 font-normal text-sm">({functions.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          <ImportExcel
            label="fonctions"
            templateFilename="modele_fonctions.xlsx"
            columns={[{ key: 'name', label: 'Nom', required: true }]}
            onParse={rows => {
              const valid: any[] = []; const errors: string[] = []
              rows.forEach((r: any, i) => {
                if (!r.name) { errors.push(`Ligne ${i+2} : nom requis`); return }
                valid.push(r)
              })
              return { valid, errors }
            }}
            onImport={async rows => {
              for (const r of rows) {
                await supabase.from('job_functions').upsert({ name: String(r.name).trim() }, { onConflict: 'name' })
              }
              await load()
            }}
          />
          <button onClick={openAdd} className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Ajouter
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Nom</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-20">Code</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Statut</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {functions.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-600">Aucune fonction</td></tr>}
            {functions.map(f => (
              <tr key={f.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-800">{f.name}</td>
                <td className="px-4 py-2.5">
                  {f.code
                    ? <span className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs font-bold font-mono">{f.code}</span>
                    : <span className="text-gray-700 text-xs">{f.name.slice(0,3).toUpperCase()}</span>
                  }
                </td>
                <td className="px-4 py-2.5">
                  <button onClick={() => toggleActive(f)}
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium cursor-pointer ${f.is_active ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {f.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5 justify-end">
                    <button onClick={() => openEdit(f)} className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => setDeletingId(f.id)} className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={editing ? 'Modifier la fonction' : 'Nouvelle fonction'} onClose={() => setModal(null)}>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Field label="Nom de la fonction *">
                <input value={name} onChange={e => setName(e.target.value)} className="input" placeholder="Chef de rang" autoFocus />
              </Field>
            </div>
            <Field label="Code (3-5 lettres)" hint="Ex : CDR, RU, MGR">
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5))}
                className="input font-mono uppercase" placeholder="CDR" maxLength={5} />
            </Field>
          </div>
          {saveError && <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{saveError}</div>}
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

// ─── Contacts utiles ──────────────────────────────────────────────────────────

type ContactUtile = {
  id: string
  role_label: string
  contact_name: string | null
  phone: string | null
  email: string | null
  sort_order: number
}

const DEFAULT_CONTACT_ROLES = ['Support technique', 'Direction financière', 'Comptabilité', 'Agence intérim (CRIT)', 'Direction RH']

const CONTACTS_SQL = `CREATE TABLE IF NOT EXISTS contacts_utiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID REFERENCES sites(id),
  role_label TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE contacts_utiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cu_select" ON contacts_utiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cu_write" ON contacts_utiles FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('superadmin', 'admin', 'responsable')));`

function ContactsUtiles() {
  const { selectedSiteId } = useSite()
  const [rows, setRows] = useState<ContactUtile[]>([])
  const [loading, setLoading] = useState(true)
  const [tableError, setTableError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [sqlVisible, setSqlVisible] = useState(false)

  async function load() {
    setLoading(true)
    setTableError(false)
    let q = supabase.from('contacts_utiles').select('id, role_label, contact_name, phone, email, sort_order').order('sort_order')
    if (selectedSiteId) q = q.eq('site_id', selectedSiteId)
    const { data, error } = await q
    if (error) {
      setTableError(true)
      setRows(DEFAULT_CONTACT_ROLES.map((r, i) => ({ id: '', role_label: r, contact_name: null, phone: null, email: null, sort_order: i })))
    } else if ((data ?? []).length === 0) {
      setRows(DEFAULT_CONTACT_ROLES.map((r, i) => ({ id: '', role_label: r, contact_name: null, phone: null, email: null, sort_order: i })))
    } else {
      setRows(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [selectedSiteId])

  function update(idx: number, field: keyof ContactUtile, value: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value || null } : r))
  }

  function addRow() {
    setRows(prev => [...prev, { id: '', role_label: '', contact_name: null, phone: null, email: null, sort_order: prev.length }])
  }

  function removeRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx))
  }

  async function saveAll() {
    setSaving(true); setSaveError(null); setSaved(false)
    try {
      let delQ = supabase.from('contacts_utiles').delete()
      if (selectedSiteId) delQ = delQ.eq('site_id', selectedSiteId)
      else delQ = delQ.is('site_id', null)
      await delQ
      const inserts = rows.filter(r => r.role_label.trim()).map((r, i) => ({
        site_id: selectedSiteId || null,
        role_label: r.role_label.trim(),
        contact_name: r.contact_name || null,
        phone: r.phone || null,
        email: r.email || null,
        sort_order: i,
      }))
      if (inserts.length > 0) {
        const { error } = await supabase.from('contacts_utiles').insert(inserts)
        if (error) throw error
      }
      await load(); setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch (e: any) { setSaveError(e?.message ?? JSON.stringify(e)) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="text-sm text-gray-600 py-4">Chargement…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">Contacts utiles</h2>
        <div className="flex gap-2">
          <button onClick={() => { setSqlVisible(v => !v) }}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            SQL
          </button>
          <button onClick={addRow}
            className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800">
            + Ajouter un contact
          </button>
        </div>
      </div>

      {sqlVisible && (
        <div className="mb-4 bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-700">SQL à exécuter dans Supabase (une seule fois)</span>
            <button onClick={() => navigator.clipboard.writeText(CONTACTS_SQL)}
              className="text-xs text-blue-600 hover:underline">Copier</button>
          </div>
          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">{CONTACTS_SQL}</pre>
        </div>
      )}

      {tableError && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          La table <code className="font-mono">contacts_utiles</code> n'existe pas encore. Exécutez le SQL ci-dessus dans Supabase, puis rechargez.
        </div>
      )}
      {saveError && <div className="mb-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{saveError}</div>}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-700 w-52">Rôle</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-700">Nom</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-700 w-40">Téléphone</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-700 w-52">Email</th>
              <th className="px-4 py-2.5 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((r, i) => (
              <tr key={i} className="group hover:bg-gray-50/50">
                <td className="px-4 py-2">
                  <input value={r.role_label} onChange={e => update(i, 'role_label', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-300"
                    placeholder="Ex: Support technique" />
                </td>
                <td className="px-4 py-2">
                  <input value={r.contact_name ?? ''} onChange={e => update(i, 'contact_name', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-300"
                    placeholder="Nom prénom" />
                </td>
                <td className="px-4 py-2">
                  <input value={r.phone ?? ''} onChange={e => update(i, 'phone', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-300"
                    placeholder="0X XX XX XX XX" />
                </td>
                <td className="px-4 py-2">
                  <input value={r.email ?? ''} onChange={e => update(i, 'email', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-300"
                    placeholder="email@exemple.com" />
                </td>
                <td className="px-2 py-2">
                  <button onClick={() => removeRow(i)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 transition-opacity rounded">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-600">Aucun contact.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        {saved && <span className="text-sm text-emerald-600 font-medium">Enregistré ✓</span>}
        <button onClick={saveAll} disabled={saving || tableError}
          className="px-5 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-40">
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Section = 'horaires' | 'absence' | 'fonctions' | 'contacts' | 'roles' | 'journal'

// ─── Rôles et accès ───────────────────────────────────────────────────────────

const PERM_CATS = [
  { label: 'Sites et équipes', perms: [
    { key: 'create_site', label: 'Créer un site' },
    { key: 'edit_teams', label: 'Modifier les équipes' },
  ]},
  { label: 'Salariés', perms: [
    { key: 'create_employee', label: 'Créer un salarié' },
    { key: 'delete_employee', label: 'Supprimer un salarié' },
    { key: 'import_employees', label: 'Importer des salariés' },
  ]},
  { label: 'Codes', perms: [
    { key: 'edit_shift_codes', label: 'Codes horaires' },
    { key: 'edit_absence_codes', label: 'Codes absence' },
  ]},
  { label: 'Planning', perms: [
    { key: 'edit_planning', label: 'Saisir / modifier le planning' },
    { key: 'edit_past_planning', label: 'Modifier un planning passé' },
    { key: 'apply_cycle', label: 'Appliquer un cycle' },
    { key: 'print_planning', label: 'Imprimer le planning' },
    { key: 'print_emargement', label: "Imprimer la feuille d'émargement" },
    { key: 'view_hours_counter', label: "Voir le compteur d'heures" },
    { key: 'archive_planning', label: 'Archiver le planning' },
    { key: 'unarchive_planning', label: 'Désarchiver le planning' },
  ]},
  { label: 'Cycles', perms: [
    { key: 'view_cycles', label: 'Voir les cycles' },
    { key: 'edit_cycles', label: 'Modifier les cycles' },
  ]},
  { label: 'Contrôle de gestion', perms: [
    { key: 'edit_staffing', label: 'Structures de staffing' },
    { key: 'edit_calendar', label: 'Calendrier' },
  ]},
  { label: 'Paramétrage', perms: [
    { key: 'edit_functions', label: 'Fonctions' },
  ]},
  { label: 'Utilisateurs', perms: [
    { key: 'create_responsable', label: 'Créer un responsable' },
    { key: 'create_manager', label: 'Créer un manager' },
    { key: 'create_salarie', label: 'Créer un salarié (compte)' },
  ]},
  { label: 'Consultation mobile', perms: [
    { key: 'view_own_planning', label: 'Voir son planning' },
    { key: 'view_team_planning', label: "Voir le planning de l'équipe" },
    { key: 'view_dashboard_mobile', label: 'Tableau de bord (effectifs du jour)' },
  ]},
]

const PERM_ROLES_LIST = [
  { key: 'admin', label: 'Administrateur' },
  { key: 'responsable', label: 'Responsable' },
  { key: 'manager', label: 'Manager' },
  { key: 'salarie', label: 'Salarié' },
]

const PERM_DEFAULTS: Record<string, Record<string, boolean>> = {
  admin: {
    create_site: true, edit_teams: true,
    create_employee: true, delete_employee: false, import_employees: true,
    edit_shift_codes: true, edit_absence_codes: true,
    edit_planning: true, edit_past_planning: true, apply_cycle: true, print_planning: true, print_emargement: true,
    view_hours_counter: true, archive_planning: true, unarchive_planning: false,
    edit_cycles: true, view_cycles: true,
    edit_staffing: true, edit_calendar: true, edit_functions: true,
    create_responsable: true, create_manager: true, create_salarie: true,
    view_own_planning: true, view_team_planning: true, view_dashboard_mobile: true,
  },
  responsable: {
    create_site: false, edit_teams: true,
    create_employee: true, delete_employee: true, import_employees: true,
    edit_shift_codes: true, edit_absence_codes: false,
    edit_planning: true, edit_past_planning: true, apply_cycle: true, print_planning: true, print_emargement: true,
    view_hours_counter: true, archive_planning: true, unarchive_planning: false,
    edit_cycles: true, view_cycles: true,
    edit_staffing: true, edit_calendar: true, edit_functions: false,
    create_responsable: false, create_manager: true, create_salarie: true,
    view_own_planning: false, view_team_planning: false, view_dashboard_mobile: true,
  },
  manager: {
    create_site: false, edit_teams: false,
    create_employee: false, delete_employee: false, import_employees: false,
    edit_shift_codes: false, edit_absence_codes: false,
    edit_planning: true, edit_past_planning: false, apply_cycle: true, print_planning: true, print_emargement: true,
    view_hours_counter: true, archive_planning: false, unarchive_planning: false,
    edit_cycles: false, view_cycles: true,
    edit_staffing: false, edit_calendar: false, edit_functions: false,
    create_responsable: false, create_manager: false, create_salarie: false,
    view_own_planning: false, view_team_planning: false, view_dashboard_mobile: true,
  },
  salarie: {
    create_site: false, edit_teams: false,
    create_employee: false, delete_employee: false, import_employees: false,
    edit_shift_codes: false, edit_absence_codes: false,
    edit_planning: false, edit_past_planning: false, apply_cycle: false, print_planning: false, print_emargement: false,
    view_hours_counter: false, archive_planning: false, unarchive_planning: false,
    edit_cycles: false, view_cycles: false,
    edit_staffing: false, edit_calendar: false, edit_functions: false,
    create_responsable: false, create_manager: false, create_salarie: false,
    view_own_planning: true, view_team_planning: true, view_dashboard_mobile: false,
  },
}

function RolesAcces() {
  const [matrix, setMatrix] = useState<Record<string, Record<string, boolean>>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('role_permissions').select('role, permission, allowed').then(({ data }: { data: { role: string; permission: string; allowed: boolean }[] | null }) => {
      const m: Record<string, Record<string, boolean>> = {}
      for (const r of PERM_ROLES_LIST) m[r.key] = { ...PERM_DEFAULTS[r.key] }
      for (const row of (data ?? [])) {
        if (!m[row.role]) m[row.role] = {}
        m[row.role][row.permission] = row.allowed
      }
      setMatrix(m)
      setLoading(false)

      // Insérer les permissions manquantes avec leurs valeurs par défaut
      const missingRows: { role: string; permission: string; allowed: boolean }[] = []
      for (const r of PERM_ROLES_LIST) {
        for (const cat of PERM_CATS) {
          for (const perm of cat.perms) {
            const inDb = (data ?? []).some(row => row.role === r.key && row.permission === perm.key)
            if (!inDb) {
              missingRows.push({ role: r.key, permission: perm.key, allowed: PERM_DEFAULTS[r.key]?.[perm.key] ?? false })
            }
          }
        }
      }
      if (missingRows.length > 0) {
        supabase.from('role_permissions').upsert(missingRows, { onConflict: 'role,permission' })
      }
    })
  }, [])

  function toggle(role: string, perm: string) {
    setMatrix(prev => ({
      ...prev,
      [role]: { ...prev[role], [perm]: !prev[role]?.[perm] },
    }))
  }

  async function handleSave() {
    setSaving(true); setSaveError(null)
    const rows: any[] = []
    for (const r of PERM_ROLES_LIST) {
      for (const cat of PERM_CATS) {
        for (const perm of cat.perms) {
          rows.push({ role: r.key, permission: perm.key, allowed: matrix[r.key]?.[perm.key] ?? false })
        }
      }
    }
    const { error } = await supabase.from('role_permissions').upsert(rows, { onConflict: 'role,permission' })
    setSaving(false)
    if (error) { setSaveError(error.message) } else { setSaved(true); setTimeout(() => setSaved(false), 3000) }
  }

  if (loading) return <div className="text-sm text-gray-600">Chargement…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Rôles et accès</h2>
          <p className="text-xs text-gray-700 mt-0.5">L'administrateur a toujours toutes les permissions (non modifiable).</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-emerald-600 font-medium">Permissions mises à jour ✓</span>}
          {saveError && <span className="text-sm text-red-600">{saveError}</span>}
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50">
            {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="text-left px-4 py-3 bg-gray-50 border-b border-gray-200 font-medium text-gray-700 text-xs uppercase tracking-wider w-72">
                Permission
              </th>
              {PERM_ROLES_LIST.map(r => (
                <th key={r.key} className="px-6 py-3 bg-gray-50 border-b border-l border-gray-200 font-semibold text-gray-700 text-center w-36">
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERM_CATS.map(cat => (
              <Fragment key={cat.label}>
                <tr>
                  <td colSpan={4} className="px-4 py-2 bg-slate-50 border-b border-gray-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                    {cat.label}
                  </td>
                </tr>
                {cat.perms.map(perm => (
                  <tr key={perm.key} className="hover:bg-gray-50 border-b border-gray-100">
                    <td className="px-4 py-2.5 text-gray-700 pl-8">{perm.label}</td>
                    {PERM_ROLES_LIST.map(r => (
                      <td key={r.key} className="px-6 py-2.5 border-l border-gray-100 text-center">
                        <input
                          type="checkbox"
                          checked={matrix[r.key]?.[perm.key] ?? false}
                          onChange={() => toggle(r.key, perm.key)}
                          className="w-4 h-4 rounded accent-slate-900 cursor-pointer"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Journal d'audit ─────────────────────────────────────────────────────────

type AuditRow = {
  id: string
  created_at: string
  user_id: string
  action_type: string
  detail: string | null
  users?: { email: string | null; login_code: string | null } | null
}

const ACTION_LABELS: Record<string, string> = {
  reset_password: 'Réinitialisation mot de passe',
  deactivate_employee: 'Désactivation employé',
  anonymize_employee: 'Anonymisation employé',
  export_data: 'Export données',
  create_user: 'Création compte',
  delete_user: 'Suppression compte',
}

function JournalAudit() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterUser, setFilterUser] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterDays, setFilterDays] = useState('30')

  async function load() {
    setLoading(true)
    const since = new Date()
    since.setDate(since.getDate() - parseInt(filterDays || '30'))
    let q = supabase
      .from('audit_log')
      .select('id, created_at, user_id, action_type, detail, users(email, login_code)')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(200)
    if (filterAction) q = q.eq('action_type', filterAction)
    const { data } = await q
    let filtered = (data ?? []) as AuditRow[]
    if (filterUser.trim()) {
      const needle = filterUser.trim().toLowerCase()
      filtered = filtered.filter(r => {
        const email = r.users?.email ?? ''
        const code = r.users?.login_code ?? ''
        return email.toLowerCase().includes(needle) || code.toLowerCase().includes(needle)
      })
    }
    setRows(filtered)
    setLoading(false)
  }

  useEffect(() => { load() }, [filterAction, filterDays])

  function formatDate(iso: string) {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  }

  function userLabel(row: AuditRow) {
    if (row.users?.login_code) return row.users.login_code
    if (row.users?.email) return row.users.email.replace('@planekipe.local', '')
    return row.user_id.slice(0, 8) + '…'
  }

  const actionTypes = Array.from(new Set(rows.map(r => r.action_type).filter(Boolean)))

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-5 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Utilisateur</label>
          <input
            type="text"
            value={filterUser}
            onChange={e => setFilterUser(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') load() }}
            placeholder="Email ou code MP-…"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 w-52"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Action</label>
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200">
            <option value="">Toutes</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Période</label>
          <select value={filterDays} onChange={e => setFilterDays(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200">
            <option value="7">7 derniers jours</option>
            <option value="30">30 derniers jours</option>
            <option value="90">90 derniers jours</option>
            <option value="365">1 an</option>
          </select>
        </div>
        <button onClick={load} className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors">
          Actualiser
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-600 py-8 text-center">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-600 py-8 text-center">Aucune entrée pour cette période.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap">Date / Heure</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Utilisateur</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Action</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Détail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap font-mono text-xs">{formatDate(row.created_at)}</td>
                  <td className="px-4 py-2.5 text-gray-700 font-medium whitespace-nowrap">{userLabel(row)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                      {ACTION_LABELS[row.action_type] ?? row.action_type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 text-xs max-w-xs truncate">{row.detail ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-600 mt-3">{rows.length} entrée{rows.length > 1 ? 's' : ''} affichée{rows.length > 1 ? 's' : ''}</p>
    </div>
  )
}

export default function ParametragePage() {
  const { role: currentRole, loading: authLoading } = useAuth()
  const { can, loading: permsLoading } = usePermissions()
  const [section, setSection] = useState<Section>('horaires')

  const isManagerRole = currentRole === 'responsable' || currentRole === 'manager'
  const waitingPerms = isManagerRole && permsLoading

  const tabs: { id: Section; label: string }[] = [
    ...(isAdmin(currentRole) || can('edit_shift_codes')   ? [{ id: 'horaires'  as Section, label: 'Codes horaires' }] : []),
    ...(isAdmin(currentRole) || can('edit_absence_codes') ? [{ id: 'absence'   as Section, label: 'Codes absence'  }] : []),
    ...(isAdmin(currentRole) || can('edit_functions')     ? [{ id: 'fonctions' as Section, label: 'Fonctions'      }] : []),
    ...((isSuperAdmin(currentRole) || isAdmin(currentRole) || currentRole === 'responsable') ? [{ id: 'contacts' as Section, label: 'Contacts utiles' }] : []),
    ...(isSuperAdmin(currentRole) ? [{ id: 'roles' as Section, label: 'Rôles et accès' }] : []),
    ...(isSuperAdmin(currentRole) || isAdmin(currentRole) ? [{ id: 'journal' as Section, label: 'Journal' }] : []),
  ]

  // Corriger la section active si elle n'est plus visible (ex: changement de rôle)
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some(t => t.id === section)) {
      setSection(tabs[0].id)
    }
  }, [tabs.map(t => t.id).join(',')])

  if (authLoading || waitingPerms) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-500 text-sm">Chargement…</p>
      </div>
    )
  }

  if (!isAdmin(currentRole) && !isManagerRole) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-800">Accès refusé</p>
          <p className="text-sm text-slate-500 mt-1">Cette page est réservée aux administrateurs.</p>
        </div>
      </div>
    )
  }

  if (isManagerRole && tabs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-800">Accès refusé</p>
          <p className="text-sm text-slate-500 mt-1">Vous n'avez pas de permission pour le paramétrage.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Paramétrage</h1>
        <p className="text-gray-700 text-sm mt-1">Codes horaires, codes absence, fonctions</p>
      </div>

      <div className="flex gap-0 border-b border-gray-200 mb-8 flex-wrap">
        {tabs.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              section === s.id
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-gray-700 hover:text-gray-700 hover:border-gray-300'
            }`}>
            {s.label}
          </button>
        ))}
      </div>

      {section === 'horaires'   && <CodesHoraires />}
      {section === 'absence'    && <CodesAbsence />}
      {section === 'fonctions'  && <Fonctions />}
      {section === 'contacts'   && <ContactsUtiles />}
      {section === 'roles'      && <RolesAcces />}
      {section === 'journal'    && <JournalAudit />}
    </div>
  )
}
