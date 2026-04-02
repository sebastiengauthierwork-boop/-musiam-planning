'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Team = {
  id: string
  name: string
  type: 'point_de_vente' | 'metier'
  description: string | null
  created_at: string
}

type TeamWithCount = Team & { employeeCount: number }

type FormData = {
  name: string
  type: 'point_de_vente' | 'metier'
  description: string
}

const emptyForm: FormData = { name: '', type: 'point_de_vente', description: '' }

export default function EquipesPage() {
  const [teams, setTeams] = useState<TeamWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [formData, setFormData] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  async function loadTeams() {
    const [teamsRes, etRes] = await Promise.all([
      supabase.from('teams').select('*').order('name'),
      supabase.from('employee_teams').select('team_id'),
    ])
    if (teamsRes.error) { setError(teamsRes.error.message); return }

    const countByTeam: Record<string, number> = {}
    for (const et of etRes.data ?? []) {
      countByTeam[et.team_id] = (countByTeam[et.team_id] ?? 0) + 1
    }

    setTeams(
      (teamsRes.data ?? []).map((t) => ({ ...t, employeeCount: countByTeam[t.id] ?? 0 }))
    )
  }

  useEffect(() => {
    loadTeams().finally(() => setLoading(false))
  }, [])

  function openAdd() {
    setEditingTeam(null)
    setFormData(emptyForm)
    setShowModal(true)
  }

  function openEdit(team: Team) {
    setEditingTeam(team)
    setFormData({ name: team.name, type: team.type, description: team.description ?? '' })
    setShowModal(true)
  }

  async function handleSave() {
    if (!formData.name.trim()) return
    setSaving(true)
    try {
      const payload = {
        name: formData.name.trim(),
        type: formData.type,
        description: formData.description.trim() || null,
      }
      if (editingTeam) {
        const { error } = await supabase.from('teams').update(payload).eq('id', editingTeam.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('teams').insert(payload)
        if (error) throw error
      }
      setShowModal(false)
      await loadTeams()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('teams').delete().eq('id', id)
    if (error) { alert(error.message); return }
    setConfirmDeleteId(null)
    await loadTeams()
  }

  if (loading) return <div className="flex items-center justify-center h-full text-gray-400 text-sm">Chargement…</div>

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Équipes</h1>
          <p className="text-gray-500 text-sm mt-1">{teams.length} équipe{teams.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openAdd} className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Ajouter une équipe
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm mb-6">Erreur : {error}</div>}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nom</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Employés</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {teams.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-gray-400">Aucune équipe</td>
              </tr>
            )}
            {teams.map((team) => (
              <tr key={team.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3.5 font-medium text-gray-900">{team.name}</td>
                <td className="px-5 py-3.5"><TypeBadge type={team.type} /></td>
                <td className="px-5 py-3.5 text-gray-500 max-w-xs truncate">{team.description ?? '—'}</td>
                <td className="px-5 py-3.5 text-right text-gray-600">{team.employeeCount}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => openEdit(team)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={() => setConfirmDeleteId(team.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal title={editingTeam ? 'Modifier l\'équipe' : 'Nouvelle équipe'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <Field label="Nom *">
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input"
                placeholder="Café Richelieu"
                autoFocus
              />
            </Field>
            <Field label="Type *">
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as FormData['type'] })}
                className="input"
              >
                <option value="point_de_vente">Point de vente</option>
                <option value="metier">Métier</option>
              </select>
            </Field>
            <Field label="Description">
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="input resize-none"
                rows={3}
                placeholder="Description optionnelle…"
              />
            </Field>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving || !formData.name.trim()} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <Modal title="Supprimer l'équipe" onClose={() => setConfirmDeleteId(null)}>
          <p className="text-sm text-gray-600">Cette action est irréversible. Les affectations d'employés seront également supprimées.</p>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setConfirmDeleteId(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Annuler
            </button>
            <button onClick={() => handleDelete(confirmDeleteId)} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors">
              Supprimer
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  return type === 'point_de_vente' ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">Point de vente</span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700">Métier</span>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}
