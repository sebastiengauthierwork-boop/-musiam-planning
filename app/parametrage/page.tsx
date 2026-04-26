'use client'

export const dynamic = 'force-dynamic'

import { Fragment, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { decimalToHMin, hMinToDecimal } from '@/lib/timeUtils'
import ImportExcel from '@/components/ImportExcel'
import { teamLabel } from '@/lib/teamUtils'
import { useSite } from '@/lib/site-context'
import { useAuth } from '@/lib/auth'

// ─── Types ────────────────────────────────────────────────────────────────────

type ShiftCode = {
  id: string; code: string; label: string
  team_id: string | null; team_prefix: string | null; location_prefix: string | null
  arrival_time: string | null; start_time: string | null; end_time: string | null; departure_time: string | null
  break_minutes: number; pause_minutes: number; dressing_minutes: number
  net_hours: number | null; target_hours: number | null; paid_hours: number | null
  meal_included: boolean
}
type AbsenceCode = { id: string; code: string; label: string; is_paid: boolean }
type TeamOption = { id: string; name: string; cdpf: string | null }
type JobFunction = { id: string; name: string; code: string | null; is_active: boolean }

type ShiftForm = {
  code: string; label: string
  paid_hours: string   // heures nettes/payées — champ principal
  start_time: string   // prise de poste — champ principal
  break_minutes: string   // temps de repas (min)
  dressing_minutes: string // habillage total (min)
  meal_included: boolean
  // calculés automatiquement
  end_time: string; arrival_time: string; departure_time: string
}
type AbsenceForm = { code: string; label: string; is_paid: boolean }
type Structure = { id: string; name: string; site_id?: string | null }
type StructurePosition = { id: string; structure_id: string; position_name: string; required_count: number }
type CalendarEntry = { date: string; team_id: string | null; structure_id: string | null }

const emptyShiftForm: ShiftForm = {
  code: '', label: '',
  paid_hours: '', start_time: '',
  break_minutes: '0', dressing_minutes: '0',
  meal_included: false,
  end_time: '', arrival_time: '', departure_time: '',
}
const emptyAbsenceForm: AbsenceForm = { code: '', label: '', is_paid: true }

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

// ─── Codes Horaires ───────────────────────────────────────────────────────────

function CodesHoraires() {
  const { selectedSiteId } = useSite()
  const [codes, setCodes] = useState<ShiftCode[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<ShiftCode | null>(null)
  const [form, setForm] = useState<ShiftForm>(emptyShiftForm)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load() {
    let q = supabase.from('shift_codes').select('*').order('code')
    if (selectedSiteId) q = q.eq('site_id', selectedSiteId)
    const { data } = await q
    setCodes(data ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [selectedSiteId])

  function openAdd() {
    setEditing(null); setForm(emptyShiftForm); setSaveError(null); setModal('add')
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
    }
    return { ...base, ...recalcShiftTimes(base) }
  }

  function openEdit(c: ShiftCode) {
    setEditing(c); setForm(shiftToForm(c)); setSaveError(null); setModal('edit')
  }

  function openDuplicate(c: ShiftCode) {
    setEditing(null); setForm({ ...shiftToForm(c), code: '' }); setSaveError(null); setModal('add')
  }

  function updateForm(f: Partial<ShiftForm>) {
    setForm(prev => {
      const next = { ...prev, ...f }
      return { ...next, ...recalcShiftTimes(next) }
    })
  }

  async function handleSave() {
    if (!form.code || !form.label) return
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

  if (loading) return <div className="text-sm text-gray-400 py-4">Chargement…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">
          Codes horaires <span className="text-gray-400 font-normal text-sm">({codes.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          <ImportExcel
            label="codes horaires"
            templateFilename="modele_codes_horaires.xlsx"
            columns={['code','label','paid_hours','start_time','break_minutes','dressing_minutes','meal_included']}
            onParse={rows => {
              const valid: any[] = []; const errors: string[] = []
              rows.forEach((r: any, i) => {
                if (!r.code || !r.label) { errors.push(`Ligne ${i+2} : code et label requis`); return }
                valid.push(r)
              })
              return { valid, errors }
            }}
            onImport={async rows => {
              for (const r of rows) {
                const ph = r.paid_hours ? hMinToDecimal(String(r.paid_hours)) : null
                const dress = parseInt(String(r.dressing_minutes ?? 0)) || 0
                await supabase.from('shift_codes').upsert({
                  code: String(r.code).trim().toUpperCase(), label: String(r.label).trim(),
                  site_id: selectedSiteId || null, team_id: null,
                  paid_hours: ph, target_hours: ph,
                  start_time: r.start_time || null, break_minutes: parseInt(String(r.break_minutes ?? 0)) || 0,
                  dressing_minutes: dress, meal_included: String(r.meal_included).toLowerCase() === 'true' || r.meal_included === 1,
                  pause_minutes: 0,
                }, { onConflict: 'code,site_id' })
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

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {['Code', 'Label', 'Arrivée', 'Prise de poste', 'Fin de poste', 'Départ', 'Repas', 'Habill.', 'Repas ✓', 'Payées'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {codes.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">Aucun code horaire</td></tr>
            )}
            {codes.map(c => {
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5">
                    <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-xs">
                      {c.code}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-700 max-w-[180px] truncate">{c.label}</td>
                  <td className="px-3 py-2.5 text-gray-400 font-mono text-xs">{c.arrival_time?.slice(0, 5) ?? '—'}</td>
                  <td className="px-3 py-2.5 text-gray-700 font-mono text-xs font-semibold">{c.start_time?.slice(0, 5) ?? '—'}</td>
                  <td className="px-3 py-2.5 text-gray-700 font-mono text-xs font-semibold">{c.end_time?.slice(0, 5) ?? '—'}</td>
                  <td className="px-3 py-2.5 text-gray-400 font-mono text-xs">{c.departure_time?.slice(0, 5) ?? '—'}</td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs">{c.break_minutes}min</td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs">{c.dressing_minutes}min</td>
                  <td className="px-3 py-2.5 text-center text-xs">
                    {c.meal_included ? <span className="text-emerald-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-emerald-700 text-xs">
                    {c.paid_hours != null ? decimalToHMin(c.paid_hours) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openDuplicate(c)} title="Dupliquer" className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <button onClick={() => openEdit(c)} title="Modifier" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => setDeletingId(c.id)} title="Supprimer" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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
            {/* a) Code + b) Label */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Code *" hint="Ex: BTO, RCA, M…">
                <input value={form.code} onChange={e => updateForm({ code: e.target.value.toUpperCase() })}
                  className="input font-mono" maxLength={10} placeholder="BTO" autoFocus disabled={!!editing} />
              </Field>
              <Field label="Label *">
                <input value={form.label} onChange={e => updateForm({ label: e.target.value })}
                  className="input" placeholder="Bibliothèque Matin" />
              </Field>
            </div>

            {/* d) Heures nettes + e) Prise de poste — champs principaux */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Heures payées *" hint="Saisir en h:min — ex : 7h48 ou 7:48">
                <input type="text" value={form.paid_hours}
                  onChange={e => updateForm({ paid_hours: e.target.value })}
                  className="input font-mono text-lg font-semibold" placeholder="7h48" />
              </Field>
              <Field label="Prise de poste *" hint="Heure de début de travail effectif">
                <input type="time" value={form.start_time}
                  onChange={e => updateForm({ start_time: e.target.value })}
                  className="input font-mono text-lg font-semibold" />
              </Field>
            </div>

            {/* f) Repas + g) Habillage + h) Repas inclus */}
            <div className="grid grid-cols-3 gap-4 items-start">
              <Field label="Temps de repas (min)" hint="Inclus dans le temps de présence si 'Repas inclus'">
                <input type="number" value={form.break_minutes}
                  onChange={e => updateForm({ break_minutes: e.target.value })}
                  className="input" min={0} step={5} />
              </Field>
              <Field label="Habillage total (min)" hint="Total habillage + déshabillage (divisé par 2)">
                <input type="number" value={form.dressing_minutes}
                  onChange={e => updateForm({ dressing_minutes: e.target.value })}
                  className="input" min={0} step={2} />
              </Field>
              <Field label="Repas inclus">
                <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                  <input type="checkbox" checked={form.meal_included}
                    onChange={e => updateForm({ meal_included: e.target.checked })}
                    className="rounded border-gray-300 text-slate-900 w-4 h-4" />
                  <span className="text-sm text-gray-700">Oui, repas fourni</span>
                </label>
              </Field>
            </div>

            {/* Champs calculés (lecture seule) */}
            {(form.end_time || form.arrival_time) && (
              <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3">
                <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-2">Calculé automatiquement</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">Arrivée salarié</p>
                    <input readOnly value={form.arrival_time} className="input bg-gray-100 text-gray-500 font-mono cursor-not-allowed" tabIndex={-1} />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">Fin de poste</p>
                    <input readOnly value={form.end_time} className="input bg-blue-50 text-blue-700 font-mono font-semibold cursor-not-allowed" tabIndex={-1} />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">Départ salarié</p>
                    <input readOnly value={form.departure_time} className="input bg-gray-100 text-gray-500 font-mono cursor-not-allowed" tabIndex={-1} />
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
                    {parseInt(form.break_minutes) > 0 && ` · ${form.break_minutes}min repas`}
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
            <button onClick={handleSave} disabled={saving || !form.code || !form.label}
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

  async function load() {
    const { data } = await supabase.from('absence_codes').select('*').order('code')
    setCodes(data ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  function openAdd() { setEditing(null); setForm(emptyAbsenceForm); setSaveError(null); setModal('add') }
  function openEdit(c: AbsenceCode) { setEditing(c); setForm({ code: c.code, label: c.label, is_paid: c.is_paid }); setSaveError(null); setModal('edit') }

  async function handleSave() {
    if (!form.code || !form.label) return
    setSaving(true); setSaveError(null)
    const payload = { code: form.code.trim().toUpperCase(), label: form.label.trim(), is_paid: form.is_paid }
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

  if (loading) return <div className="text-sm text-gray-400 py-4">Chargement…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">Codes absence <span className="text-gray-400 font-normal text-sm">({codes.length})</span></h2>
        <div className="flex items-center gap-2">
          <ImportExcel
            label="codes absence"
            templateFilename="modele_codes_absence.xlsx"
            columns={['code','label','is_paid']}
            onParse={rows => {
              const valid: any[] = []; const errors: string[] = []
              rows.forEach((r: any, i) => {
                if (!r.code || !r.label) { errors.push(`Ligne ${i+2} : code et label requis`); return }
                valid.push(r)
              })
              return { valid, errors }
            }}
            onImport={async rows => {
              for (const r of rows) {
                await supabase.from('absence_codes').upsert({
                  code: String(r.code).trim().toUpperCase(), label: String(r.label).trim(),
                  is_paid: String(r.is_paid).toLowerCase() === 'true' || r.is_paid === 1,
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
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Label</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Payé</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {codes.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Aucun code absence</td></tr>}
            {codes.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5"><span className={`font-mono font-bold px-2 py-0.5 rounded text-sm ${c.is_paid ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{c.code}</span></td>
                <td className="px-4 py-2.5 text-gray-700">{c.label}</td>
                <td className="px-4 py-2.5">
                  {c.is_paid
                    ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700">Oui</span>
                    : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">Non</span>}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5 justify-end">
                    <button onClick={() => openEdit(c)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => setDeletingId(c.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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
    </div>
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
const G_START = 5   // 05:00
const G_END   = 23  // 23:00
const G_TOTAL = (G_END - G_START) * 60

function tMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function gPct(min: number): number {
  return Math.max(0, Math.min(100, (min - G_START * 60) / G_TOTAL * 100))
}

type GanttRow = {
  label: string; code: string
  start: string | null; end: string | null; breakMin: number
  paidH: number | null; colorIdx: number
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

  // deduplicated positions for legend
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

      {/* Toolbar — masqué à l'impression via .no-print dans globals.css */}
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

      {/* Zone imprimable */}
      <div className="print-gantt-area p-5">

        {/* En-tête impression uniquement */}
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

        {/* Diagramme */}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 700 }}>

            {/* Axe horaire */}
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

            {/* Lignes */}
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
                    {/* Label */}
                    <div style={{
                      width: 116, minWidth: 116, paddingRight: 8, textAlign: 'right',
                      fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: '#334155', flexShrink: 0,
                    }}>
                      {row.label}
                    </div>

                    {/* Zone barre */}
                    <div style={{ flex: 1, position: 'relative', height: 24, borderLeft: '1px solid #e2e8f0' }}>
                      {/* Grille verticale */}
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
                          {/* Barre principale */}
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
                            {/* Zone pause (centrée, plus claire + tiretée) */}
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

                          {/* Heures payées à droite de la barre */}
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

            {/* Pied de tableau */}
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

type PosLine = { code: string; required_count: string }
type ShiftCodeMin = { id: string; code: string; label: string; paid_hours: number | null; net_hours: number | null; start_time: string | null; end_time: string | null; break_minutes: number }

function Structures() {
  const { selectedSiteId } = useSite()
  const [structures, setStructures] = useState<Structure[]>([])
  const [positions, setPositions] = useState<StructurePosition[]>([])
  const [shiftCodes, setShiftCodes] = useState<ShiftCodeMin[]>([])
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
    let sQ = supabase.from('staffing_structures').select('*').order('name')
    if (selectedSiteId) sQ = sQ.eq('site_id', selectedSiteId)
    let scQ = supabase.from('shift_codes').select('id, code, label, paid_hours, net_hours, start_time, end_time, break_minutes').order('code')
    if (selectedSiteId) scQ = scQ.eq('site_id', selectedSiteId)
    const [sRes, pRes, scRes] = await Promise.all([
      sQ,
      supabase.from('staffing_structure_positions').select('*').order('position_name'),
      scQ,
    ])
    setStructures(sRes.data ?? [])
    setPositions(pRes.data ?? [])
    setShiftCodes(scRes.data ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [selectedSiteId])

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
        const { data, error } = await supabase.from('staffing_structures').insert({ name: name.trim(), site_id: selectedSiteId || null }).select('id').single()
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
        <h2 className="text-base font-semibold text-gray-900">
          Structures de staffing <span className="text-gray-400 font-normal text-sm">({structures.length})</span>
        </h2>
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
                  {/* Zone cliquable : chevron + nom + total */}
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
                  {/* Boutons action */}
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

              {/* Gantt déployé */}
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

              {/* Column headers */}
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
                      {/* Code dropdown */}
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

                      {/* Count */}
                      <input
                        type="number"
                        value={line.required_count}
                        onChange={e => setPosLines(prev => prev.map((x, j) => j === i ? { ...x, required_count: e.target.value } : x))}
                        className="input text-center"
                        min={1} max={20}
                      />

                      {/* Hours preview */}
                      <div className="text-center text-xs font-mono">
                        {sc && h > 0 ? (
                          <span className={lineTotal > 0 ? 'text-emerald-600 font-semibold' : 'text-gray-400'}>
                            {lineTotal > 0 ? fmtH(lineTotal) : fmtH(h)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </div>

                      {/* Remove */}
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

              {/* Total */}
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
    const { data } = await supabase.from('job_functions').select('*').order('name')
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

  if (loading) return <div className="text-sm text-gray-400 py-4">Chargement…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">
          Fonctions <span className="text-gray-400 font-normal text-sm">({functions.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          <ImportExcel
            label="fonctions"
            templateFilename="modele_fonctions.xlsx"
            columns={['name']}
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
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Nom</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">Code</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Statut</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {functions.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Aucune fonction</td></tr>}
            {functions.map(f => (
              <tr key={f.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-800">{f.name}</td>
                <td className="px-4 py-2.5">
                  {f.code
                    ? <span className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs font-bold font-mono">{f.code}</span>
                    : <span className="text-gray-300 text-xs">{f.name.slice(0,3).toUpperCase()}</span>
                  }
                </td>
                <td className="px-4 py-2.5">
                  <button onClick={() => toggleActive(f)}
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium cursor-pointer ${f.is_active ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                    {f.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5 justify-end">
                    <button onClick={() => openEdit(f)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => setDeletingId(f.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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

function Calendrier() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [teamId, setTeamId] = useState<string>('')
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([])
  const [structures, setStructures] = useState<Structure[]>([])
  const [calMap, setCalMap] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(true)
  const [pendingDate, setPendingDate] = useState<string | null>(null)
  // Remplissage rapide
  const [showFill, setShowFill] = useState(false)
  const [fillStructId, setFillStructId] = useState<string>('')
  const [fillFrom, setFillFrom] = useState<string>(`${now.getFullYear()}-01-01`)
  const [fillTo, setFillTo] = useState<string>(`${now.getFullYear()}-12-31`)
  const [fillDays, setFillDays] = useState([true, true, true, true, true, true, true])
  const [filling, setFilling] = useState(false)

  const colorOf = (id: string) => STRUCT_COLORS[structures.findIndex(s => s.id === id) % STRUCT_COLORS.length] ?? STRUCT_COLORS[0]

  function toISO(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  // Load teams + structures once
  useEffect(() => {
    Promise.all([
      supabase.from('teams').select('id, name, cdpf').order('name'),
      supabase.from('staffing_structures').select('id, name').order('name'),
    ]).then(([tRes, sRes]) => {
      const tList = tRes.data ?? []
      setTeams(tList)
      setStructures(sRes.data ?? [])
      if (tList.length > 0) {
        setTeamId(tList[0].id) // triggers calendar load via second effect
      } else {
        setLoading(false)
      }
    })
  }, [])

  // Load calendar when team or year changes
  useEffect(() => {
    if (!teamId) return
    setLoading(true)
    supabase.from('annual_calendar')
      .select('date, structure_id')
      .eq('team_id', teamId)
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`)
      .then(({ data }: { data: any }) => {
        const map: Record<string, string | null> = {}
        for (const c of (data ?? [])) map[c.date] = c.structure_id
        setCalMap(map)
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
      const dow = (cur.getDay() + 6) % 7 // Mon=0..Sun=6
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

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 1 + i)
  const DAY_LABELS_LONG = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

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
          <button onClick={() => setShowFill(v => !v)}
            className={`inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${showFill ? 'bg-indigo-700 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Remplissage rapide
          </button>
        </div>
      </div>

      {/* Légende structures */}
      <div className="flex flex-wrap gap-2 mb-5">
        {structures.map((s, i) => (
          <span key={s.id} className={`px-2 py-0.5 rounded border text-xs font-medium ${STRUCT_COLORS[i % STRUCT_COLORS.length]}`}>{s.name}</span>
        ))}
        {structures.length === 0 && <span className="text-xs text-gray-400">Créez d'abord des structures</span>}
      </div>

      {/* Panneau remplissage rapide */}
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

      {/* Grille 12 mois */}
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 12 }, (_, m) => {
          const nDays = new Date(year, m + 1, 0).getDate()
          const firstDow = (new Date(year, m, 1).getDay() + 6) % 7 // Mon=0
          return (
            <div key={m} className="bg-white rounded-xl border border-gray-200 p-3">
              <div className="text-xs font-semibold text-gray-700 mb-2">{MONTHS_FR[m]}</div>
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
                        onClick={() => setPendingDate(isPending ? null : dateStr)}
                        className={`text-[10px] text-center py-0.5 rounded cursor-pointer font-medium transition-colors ${baseClass} ${isPending ? 'ring-2 ring-slate-400' : ''}`}
                        title={sId ? structures.find(s => s.id === sId)?.name : undefined}
                      >
                        {i + 1}
                      </div>
                      {isPending && (
                        <div className="absolute top-full left-1/2 -translate-x-1/2 z-50 bg-white border border-gray-200 rounded-lg shadow-xl min-w-[150px] py-1 mt-0.5">
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
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Section = 'horaires' | 'absence' | 'fonctions' | 'structures' | 'calendrier' | 'roles'

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
  { label: 'Paramétrage', perms: [
    { key: 'edit_staffing', label: 'Structures de staffing' },
    { key: 'edit_calendar', label: 'Calendrier' },
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
  ]},
]

const PERM_ROLES_LIST = [
  { key: 'responsable', label: 'Responsable' },
  { key: 'manager', label: 'Manager' },
  { key: 'salarie', label: 'Salarié' },
]

const PERM_DEFAULTS: Record<string, Record<string, boolean>> = {
  responsable: {
    create_site: false, edit_teams: true,
    create_employee: true, delete_employee: true, import_employees: true,
    edit_shift_codes: true, edit_absence_codes: false,
    edit_planning: true, apply_cycle: true, print_planning: true, print_emargement: true,
    view_hours_counter: true, archive_planning: true, unarchive_planning: false,
    edit_cycles: true, view_cycles: true,
    edit_staffing: true, edit_calendar: true, edit_functions: false,
    create_responsable: false, create_manager: true, create_salarie: true,
    view_own_planning: false, view_team_planning: false,
  },
  manager: {
    create_site: false, edit_teams: false,
    create_employee: false, delete_employee: false, import_employees: false,
    edit_shift_codes: false, edit_absence_codes: false,
    edit_planning: true, apply_cycle: true, print_planning: true, print_emargement: true,
    view_hours_counter: true, archive_planning: false, unarchive_planning: false,
    edit_cycles: false, view_cycles: true,
    edit_staffing: false, edit_calendar: false, edit_functions: false,
    create_responsable: false, create_manager: false, create_salarie: false,
    view_own_planning: false, view_team_planning: false,
  },
  salarie: {
    create_site: false, edit_teams: false,
    create_employee: false, delete_employee: false, import_employees: false,
    edit_shift_codes: false, edit_absence_codes: false,
    edit_planning: false, apply_cycle: false, print_planning: false, print_emargement: false,
    view_hours_counter: false, archive_planning: false, unarchive_planning: false,
    edit_cycles: false, view_cycles: false,
    edit_staffing: false, edit_calendar: false, edit_functions: false,
    create_responsable: false, create_manager: false, create_salarie: false,
    view_own_planning: true, view_team_planning: true,
  },
}

function RolesAcces() {
  const [matrix, setMatrix] = useState<Record<string, Record<string, boolean>>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('role_permissions').select('role, permission, allowed').then(({ data }) => {
      const m: Record<string, Record<string, boolean>> = {}
      for (const r of PERM_ROLES_LIST) m[r.key] = { ...PERM_DEFAULTS[r.key] }
      for (const row of (data ?? [])) {
        if (!m[row.role]) m[row.role] = {}
        m[row.role][row.permission] = row.allowed
      }
      setMatrix(m)
      setLoading(false)
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

  if (loading) return <div className="text-sm text-gray-400">Chargement…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Rôles et accès</h2>
          <p className="text-xs text-gray-500 mt-0.5">L'administrateur a toujours toutes les permissions (non modifiable).</p>
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
              <th className="text-left px-4 py-3 bg-gray-50 border-b border-gray-200 font-medium text-gray-500 text-xs uppercase tracking-wider w-72">
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

export default function ParametragePage() {
  const { role: currentRole, loading: authLoading } = useAuth()
  const [section, setSection] = useState<Section>('horaires')

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-500 text-sm">Chargement…</p>
      </div>
    )
  }

  if (currentRole !== 'admin' && currentRole !== 'responsable') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-800">Accès refusé</p>
          <p className="text-sm text-slate-500 mt-1">
            Cette page est réservée aux administrateurs.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Paramétrage</h1>
        <p className="text-gray-500 text-sm mt-1">Codes horaires, absence, fonctions, structures de staffing et calendrier</p>
      </div>

      <div className="flex gap-0 border-b border-gray-200 mb-8 flex-wrap">
        {([
          { id: 'horaires',   label: 'Codes horaires' },
          { id: 'absence',    label: 'Codes absence'  },
          { id: 'fonctions',  label: 'Fonctions'      },
          { id: 'structures', label: 'Structures'     },
          { id: 'calendrier', label: 'Calendrier'     },
          ...(currentRole === 'admin' ? [{ id: 'roles' as Section, label: 'Rôles et accès' }] : []),
        ] as { id: Section; label: string }[]).map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              section === s.id
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}>
            {s.label}
          </button>
        ))}
      </div>

      {section === 'horaires'   && <CodesHoraires />}
      {section === 'absence'    && <CodesAbsence />}
      {section === 'fonctions'  && <Fonctions />}
      {section === 'structures' && <Structures />}
      {section === 'calendrier' && <Calendrier />}
      {section === 'roles'      && <RolesAcces />}
    </div>
  )
}
