'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSite, type Site } from '@/lib/site-context'

type Team = {
  id: string
  name: string
  cdpf: string | null
  type: 'point_de_vente' | 'metier'
  description: string | null
  created_at: string
  site_id: string | null
  site_name: string | null
}

type TeamWithCount = Team & { employeeCount: number }

type FormData = {
  name: string
  cdpf: string
  type: 'point_de_vente' | 'metier'
  description: string
  site_id: string
}

const emptyForm: FormData = { name: '', cdpf: '', type: 'point_de_vente', description: '', site_id: '' }

export default function EquipesPage() {
  const { sites, selectedSiteId } = useSite()
  const [teams, setTeams] = useState<TeamWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [formData, setFormData] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  async function loadTeams() {
    let q = supabase
      .from('teams')
      .select('id, name, cdpf, type, description, created_at, site_id, sites(name)')
      .order('name').limit(200)
    if (selectedSiteId) q = q.eq('site_id', selectedSiteId)

    const [teamsRes, etRes] = await Promise.all([
      q,
      supabase.from('employee_teams').select('team_id').limit(2000),
    ])
    if (teamsRes.error) { setError(teamsRes.error.message); return }

    const countByTeam: Record<string, number> = {}
    for (const et of etRes.data ?? []) {
      countByTeam[et.team_id] = (countByTeam[et.team_id] ?? 0) + 1
    }

    setTeams(
      (teamsRes.data ?? []).map((t: any) => ({
        ...t,
        site_name: t.sites?.name ?? null,
        employeeCount: countByTeam[t.id] ?? 0,
      }))
    )
  }

  useEffect(() => { loadTeams().finally(() => setLoading(false)) }, [selectedSiteId])

  // Grouper les équipes par site quand on voit tous les sites
  const grouped = useMemo(() => {
    if (selectedSiteId) return null   // pas de groupement si un seul site sélectionné
    const map = new Map<string, { siteName: string; teams: TeamWithCount[] }>()
    const noSite: TeamWithCount[] = []
    for (const team of teams) {
      if (team.site_id) {
        if (!map.has(team.site_id)) map.set(team.site_id, { siteName: team.site_name ?? 'Site inconnu', teams: [] })
        map.get(team.site_id)!.teams.push(team)
      } else {
        noSite.push(team)
      }
    }
    const groups = Array.from(map.values())
    if (noSite.length > 0) groups.push({ siteName: 'Sans site', teams: noSite })
    return groups
  }, [teams, selectedSiteId])

  function openAdd() {
    setEditingTeam(null)
    setFormData({ ...emptyForm, site_id: selectedSiteId ?? sites[0]?.id ?? '' })
    setShowModal(true)
  }

  function openEdit(team: Team) {
    setEditingTeam(team)
    setFormData({ name: team.name, cdpf: team.cdpf ?? '', type: team.type, description: team.description ?? '', site_id: team.site_id ?? '' })
    setShowModal(true)
  }

  async function handleSave() {
    if (!formData.name.trim()) return
    setSaving(true)
    try {
      const payload = {
        name: formData.name.trim(),
        cdpf: formData.cdpf.trim() || null,
        type: formData.type,
        description: formData.description.trim() || null,
        site_id: formData.site_id || null,
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
    } finally { setSaving(false) }
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
        <button onClick={openAdd}
          className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Ajouter une équipe
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm mb-6">Erreur : {error}</div>}

      {/* Vue groupée par site (tous les sites) */}
      {grouped ? (
        <div className="space-y-6">
          {grouped.map(({ siteName, teams: siteTeams }) => (
            <div key={siteName}>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">{siteName}</h2>
              <TeamsTable teams={siteTeams} showSite={false}
                onEdit={openEdit} onDelete={id => setConfirmDeleteId(id)} />
            </div>
          ))}
          {grouped.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-10 text-center text-gray-400">Aucune équipe</div>
          )}
        </div>
      ) : (
        <TeamsTable teams={teams} showSite={false}
          onEdit={openEdit} onDelete={id => setConfirmDeleteId(id)} />
      )}

      {/* Modal */}
      {showModal && (
        <Modal title={editingTeam ? 'Modifier l\'équipe' : 'Nouvelle équipe'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            {/* Site */}
            {sites.length > 0 && (
              <Field label="Site *">
                <select value={formData.site_id} onChange={e => setFormData({ ...formData, site_id: e.target.value })} className="input">
                  <option value="">— Sélectionner un site —</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Nom *">
              <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="input" placeholder="Café Richelieu" autoFocus />
            </Field>
            <Field label="CDPF">
              <input type="text" value={formData.cdpf} onChange={e => setFormData({ ...formData, cdpf: e.target.value })}
                className="input font-mono" placeholder="9603-10" />
            </Field>
            <Field label="Type *">
              <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value as FormData['type'] })} className="input">
                <option value="point_de_vente">Point de vente</option>
                <option value="metier">Métier</option>
              </select>
            </Field>
            <Field label="Description">
              <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
                className="input resize-none" rows={3} placeholder="Description optionnelle…" />
            </Field>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving || !formData.name.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </Modal>
      )}

      {confirmDeleteId && (
        <Modal title="Supprimer l'équipe" onClose={() => setConfirmDeleteId(null)}>
          <p className="text-sm text-gray-600">Cette action est irréversible. Les affectations de salariés seront également supprimées.</p>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setConfirmDeleteId(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              Annuler
            </button>
            <button onClick={() => handleDelete(confirmDeleteId)} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">
              Supprimer
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function TeamsTable({ teams, showSite, onEdit, onDelete }: {
  teams: TeamWithCount[]
  showSite: boolean
  onEdit: (t: Team) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {showSite && <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Site</th>}
            <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nom</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">CDPF</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
            <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Salariés</th>
            <th className="px-5 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {teams.length === 0 && (
            <tr><td colSpan={showSite ? 7 : 6} className="px-5 py-10 text-center text-gray-400">Aucune équipe</td></tr>
          )}
          {teams.map(team => (
            <tr key={team.id} className="hover:bg-gray-50 transition-colors">
              {showSite && <td className="px-5 py-3.5 text-gray-500 text-xs">{team.site_name ?? '—'}</td>}
              <td className="px-5 py-3.5 font-medium text-gray-900">{team.name}</td>
              <td className="px-5 py-3.5 font-mono text-xs text-gray-500">{team.cdpf ?? <span className="text-gray-300">—</span>}</td>
              <td className="px-5 py-3.5"><TypeBadge type={team.type} /></td>
              <td className="px-5 py-3.5 text-gray-500 max-w-xs truncate">{team.description ?? '—'}</td>
              <td className="px-5 py-3.5 text-right text-gray-600">{team.employeeCount}</td>
              <td className="px-5 py-3.5">
                <div className="flex items-center justify-end gap-2">
                  <button onClick={() => onEdit(team)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button onClick={() => onDelete(team.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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
