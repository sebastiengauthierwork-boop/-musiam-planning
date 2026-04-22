'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Site = {
  id: string
  name: string
  cdpf_prefix: string | null
  address: string | null
  is_active: boolean
  created_at: string
}

type FormData = {
  name: string
  cdpf_prefix: string
  address: string
  is_active: boolean
}

const emptyForm: FormData = { name: '', cdpf_prefix: '', address: '', is_active: true }

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingSite, setEditingSite] = useState<Site | null>(null)
  const [formData, setFormData] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  async function loadSites() {
    const { data, error } = await supabase
      .from('sites').select('id, name, cdpf_prefix, address, is_active, created_at').order('name')
    if (error) { setError(error.message); return }
    setSites(data ?? [])
  }

  useEffect(() => { loadSites().finally(() => setLoading(false)) }, [])

  function openAdd() { setEditingSite(null); setFormData(emptyForm); setShowModal(true) }

  function openEdit(site: Site) {
    setEditingSite(site)
    setFormData({ name: site.name, cdpf_prefix: site.cdpf_prefix ?? '', address: site.address ?? '', is_active: site.is_active })
    setShowModal(true)
  }

  async function handleSave() {
    if (!formData.name.trim()) return
    setSaving(true)
    try {
      const payload = {
        name: formData.name.trim(),
        cdpf_prefix: formData.cdpf_prefix.trim() || null,
        address: formData.address.trim() || null,
        is_active: formData.is_active,
      }
      if (editingSite) {
        const { error } = await supabase.from('sites').update(payload).eq('id', editingSite.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('sites').insert(payload)
        if (error) throw error
      }
      setShowModal(false)
      await loadSites()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('sites').delete().eq('id', id)
    if (error) { alert(error.message); return }
    setConfirmDeleteId(null)
    await loadSites()
  }

  if (loading) return <div className="flex items-center justify-center h-full text-gray-400 text-sm">Chargement…</div>

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sites</h1>
          <p className="text-gray-500 text-sm mt-1">{sites.length} site{sites.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openAdd}
          className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Ajouter un site
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm mb-6">Erreur : {error}</div>}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nom</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Préfixe CDPF</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Adresse</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Statut</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sites.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400">Aucun site</td></tr>
            )}
            {sites.map(site => (
              <tr key={site.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3.5 font-medium text-gray-900">{site.name}</td>
                <td className="px-5 py-3.5 font-mono text-xs text-gray-500">{site.cdpf_prefix ?? <span className="text-gray-300">—</span>}</td>
                <td className="px-5 py-3.5 text-gray-500 max-w-xs truncate">{site.address ?? '—'}</td>
                <td className="px-5 py-3.5">
                  {site.is_active
                    ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700">Actif</span>
                    : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">Inactif</span>}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => openEdit(site)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={() => setConfirmDeleteId(site.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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

      {showModal && (
        <Modal title={editingSite ? 'Modifier le site' : 'Nouveau site'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <Field label="Nom *">
              <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="input" placeholder="Louvre" autoFocus />
            </Field>
            <Field label="Préfixe CDPF">
              <input type="text" value={formData.cdpf_prefix} onChange={e => setFormData({ ...formData, cdpf_prefix: e.target.value })}
                className="input font-mono" placeholder="LO" />
            </Field>
            <Field label="Adresse">
              <textarea value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })}
                className="input resize-none" rows={2} placeholder="Rue de Rivoli, 75001 Paris" />
            </Field>
            <Field label="Statut">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={formData.is_active}
                  onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-gray-300 text-slate-900" />
                <span className="text-sm text-gray-700">Site actif</span>
              </label>
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
        <Modal title="Supprimer le site" onClose={() => setConfirmDeleteId(null)}>
          <p className="text-sm text-gray-600">Cette action est irréversible. Les équipes rattachées perdront leur site.</p>
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
