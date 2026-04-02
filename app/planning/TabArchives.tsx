'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { TabProps } from './types'

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
  const [archives, setArchives] = useState<PlanningArchive[]>([])
  const [loading, setLoading] = useState(true)
  const [viewingArchive, setViewingArchive] = useState<PlanningArchive | null>(null)

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

  function handleView(archive: PlanningArchive) {
    if (onViewArchive) {
      onViewArchive(archive)
    } else {
      setViewingArchive(archive)
    }
  }

  function handlePrint(archive: PlanningArchive) {
    if (archive.pdf_url) {
      const win = window.open(archive.pdf_url, '_blank')
      if (win) { win.focus(); win.print() }
    } else {
      window.print()
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

      <div className="flex-1 overflow-auto bg-white px-6 py-4">

        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
            Chargement des archives…
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

                          {/* Imprimer */}
                          <button
                            onClick={() => handlePrint(archive)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                            Imprimer
                          </button>

                          {/* Télécharger PDF */}
                          {archive.pdf_url && (
                            <a
                              href={archive.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              download
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              Télécharger PDF
                            </a>
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
