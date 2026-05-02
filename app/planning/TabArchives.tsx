'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { TabProps } from './types'
import { useAuth } from '@/lib/auth'

async function resolveSignedUrl(pdfUrl: string): Promise<string | null> {
  if (!pdfUrl) return null
  // Fallback base64 : utiliser directement
  if (pdfUrl.startsWith('data:')) return pdfUrl
  // Path Storage : générer une URL signée valable 1h
  const { data, error } = await supabase.storage
    .from('planning-pdfs')
    .createSignedUrl(pdfUrl, 3600)
  if (error || !data?.signedUrl) {
    console.error('createSignedUrl error:', error)
    return null
  }
  return data.signedUrl
}

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

type PlanningArchive = {
  id: string
  team_id: string
  month: number
  year: number
  archived_at: string
  archived_by: string | null
  status: string
  pdf_url: string | null
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    validated:  { label: 'Validé',    cls: 'bg-green-100 text-green-700 border-green-200' },
    published:  { label: 'Publié',    cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    draft:      { label: 'Brouillon', cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    archived:   { label: 'Archivé',   cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600 border-gray-200' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  )
}

interface TabArchivesProps extends TabProps {
  onViewArchive?: (archive: PlanningArchive) => void
}

export default function TabArchives({ teamId, teamName, year, month, onViewArchive }: TabArchivesProps) {
  const { role } = useAuth()
  const [archives, setArchives] = useState<PlanningArchive[]>([])
  const [loading, setLoading] = useState(true)
  const [viewingArchive, setViewingArchive] = useState<PlanningArchive | null>(null)
  const [unarchiveTarget, setUnarchiveTarget] = useState<PlanningArchive | null>(null)
  const [unarchiveConfirm, setUnarchiveConfirm] = useState('')
  const [unarchiving, setUnarchiving] = useState(false)
  const [unarchiveSuccess, setUnarchiveSuccess] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const { data } = await supabase
          .from('planning_archives')
          .select('*')
          .eq('team_id', teamId)
          .order('year', { ascending: false })
          .order('month', { ascending: false })
        setArchives(data ?? [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [teamId])

  async function handleView(archive: PlanningArchive) {
    if (!archive.pdf_url) { setViewingArchive(archive); return }
    const url = await resolveSignedUrl(archive.pdf_url)
    // Injecter l'URL signée dans l'archive affichée pour que l'iframe puisse la charger
    setViewingArchive({ ...archive, pdf_url: url })
  }

  async function handleDownload(archive: PlanningArchive) {
    if (!archive.pdf_url) return
    const url = await resolveSignedUrl(archive.pdf_url)
    if (!url) { alert('Impossible de générer le lien de téléchargement.'); return }
    window.open(url, '_blank')
  }

  async function handleConfirmUnarchive() {
    if (!unarchiveTarget || unarchiveConfirm !== 'CONFIRMER') return
    setUnarchiving(true)
    try {
      // Supprimer le PDF du storage si c'est un path (pas une data URL)
      if (unarchiveTarget.pdf_url && !unarchiveTarget.pdf_url.startsWith('data:')) {
        await supabase.storage.from('planning-pdfs').remove([unarchiveTarget.pdf_url])
      }
      // Supprimer l'entrée d'archive
      const { error } = await supabase
        .from('planning_archives')
        .delete()
        .eq('id', unarchiveTarget.id)
      if (error) throw error

      setArchives(prev => prev.filter(a => a.id !== unarchiveTarget.id))
      if (viewingArchive?.id === unarchiveTarget.id) setViewingArchive(null)
      setUnarchiveSuccess(`Planning ${MONTHS[unarchiveTarget.month - 1]} ${unarchiveTarget.year} désarchivé avec succès.`)
      setUnarchiveTarget(null)
      setUnarchiveConfirm('')
    } catch (err: any) {
      alert(`Erreur lors du désarchivage : ${err?.message ?? err}`)
    } finally {
      setUnarchiving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="shrink-0 px-6 py-3 border-b border-gray-200 bg-white flex items-center gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Archives — {teamName}</h2>
          <p className="text-xs text-gray-400 mt-0.5">Plannings archivés, du plus récent au plus ancien</p>
        </div>
      </div>

      {/* Modal désarchivage */}
      {unarchiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { if (!unarchiving) { setUnarchiveTarget(null); setUnarchiveConfirm('') } }} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-base font-bold text-gray-900">Désarchiver le planning</h2>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5 text-sm text-red-800 space-y-1">
              <p><strong>ATTENTION</strong> : cette action va rouvrir le planning <strong>{teamName}</strong> <strong>{MONTHS[unarchiveTarget.month - 1]} {unarchiveTarget.year}</strong> en mode édition.</p>
              <p>L'archive PDF sera supprimée définitivement.</p>
              <p className="font-semibold">Cette action est irréversible.</p>
              <p>Êtes-vous sûr de vouloir désarchiver ce planning ?</p>
            </div>
            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Tapez <span className="font-mono font-bold text-red-700">CONFIRMER</span> pour valider
              </label>
              <input
                type="text"
                value={unarchiveConfirm}
                onChange={e => setUnarchiveConfirm(e.target.value)}
                placeholder="CONFIRMER"
                disabled={unarchiving}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-300 disabled:opacity-50"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setUnarchiveTarget(null); setUnarchiveConfirm('') }}
                disabled={unarchiving}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmUnarchive}
                disabled={unarchiveConfirm !== 'CONFIRMER' || unarchiving}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {unarchiving ? 'Désarchivage…' : 'Désarchiver définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bannière succès désarchivage */}
      {unarchiveSuccess && (
        <div className="shrink-0 mx-6 mt-3 flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="flex-1">{unarchiveSuccess}</span>
          <button onClick={() => setUnarchiveSuccess(null)} className="text-green-500 hover:text-green-700 transition-colors text-xs">✕</button>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-white px-6 py-4">

        {loading ? (
          <div className="animate-pulse space-y-2 pt-2">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 p-3 border border-gray-100 rounded-lg">
                <div className="w-10 h-10 bg-gray-200 rounded-lg shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-gray-200 rounded" style={{ width: [128,112,140,104,120][i] }} />
                  <div className="h-2.5 bg-gray-100 rounded w-48" />
                </div>
                <div className="w-16 h-7 bg-gray-100 rounded-lg shrink-0" />
              </div>
            ))}
          </div>
        ) : archives.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            <p className="text-sm text-gray-400 font-medium">Aucune archive</p>
            <p className="text-xs text-gray-300">Les plannings archivés apparaîtront ici.</p>
          </div>
        ) : (
          <>
            {/* Inline view panel */}
            {viewingArchive && (
              <div className="mb-6 border border-slate-200 rounded-xl bg-slate-50 p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">
                      {MONTHS[viewingArchive.month - 1]} {viewingArchive.year}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Archivé le {fmtDate(viewingArchive.archived_at)}
                      {viewingArchive.archived_by && ` · par ${viewingArchive.archived_by}`}
                    </p>
                  </div>
                  <button
                    onClick={() => setViewingArchive(null)}
                    className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    ✕ Fermer
                  </button>
                </div>
                {viewingArchive.pdf_url ? (
                  <iframe
                    src={viewingArchive.pdf_url}
                    className="w-full rounded-lg border border-slate-200 bg-white"
                    style={{ height: '70vh' }}
                    title={`Planning ${MONTHS[viewingArchive.month - 1]} ${viewingArchive.year}`}
                  />
                ) : (
                  <div className="flex items-center justify-center h-32 text-slate-400 text-sm bg-white rounded-lg border border-slate-200">
                    Aucun fichier PDF disponible pour cette archive.
                  </div>
                )}
              </div>
            )}

            {/* Archives table */}
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-slate-100 text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 text-left font-semibold w-36">Mois</th>
                    <th className="px-4 py-3 text-left font-semibold">Date d'archivage</th>
                    <th className="px-4 py-3 text-left font-semibold">Archivé par</th>
                    <th className="px-4 py-3 text-left font-semibold">Statut</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {archives.map((archive, idx) => (
                    <tr
                      key={archive.id}
                      className={`border-t border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/30 transition-colors`}
                    >
                      <td className="px-4 py-3 font-semibold text-gray-800">
                        {MONTHS[archive.month - 1]} {archive.year}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {fmtDate(archive.archived_at)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {archive.archived_by ?? <span className="text-gray-300 italic">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={archive.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {/* Voir */}
                          {archive.pdf_url && (
                            <button
                              onClick={() => handleView(archive)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              Voir
                            </button>
                          )}

                          {/* Télécharger PDF */}
                          {archive.pdf_url && (
                            <button
                              onClick={() => handleDownload(archive)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              Télécharger PDF
                            </button>
                          )}

                          {/* Désarchiver — admin uniquement */}
                          {role === 'admin' && (
                            <button
                              onClick={() => setUnarchiveTarget(archive)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 border border-red-200 rounded-lg bg-red-50 hover:bg-red-100 transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                              </svg>
                              Désarchiver
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs text-gray-400">{archives.length} archive{archives.length > 1 ? 's' : ''}</p>
          </>
        )}
      </div>
    </div>
  )
}
