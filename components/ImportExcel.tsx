'use client'

import { useRef, useState } from 'react'

export type ImportRow = Record<string, string | number | boolean | null>

type Props<T extends ImportRow> = {
  columns: string[]          // colonnes du modèle (header de la feuille)
  onParse: (rows: T[]) => { valid: T[]; errors: string[] }
  onImport: (rows: T[]) => Promise<void>
  templateFilename: string
  label: string              // "codes horaires", "employés", etc.
}

async function downloadTemplate(columns: string[], filename: string) {
  const XLSX = await import('xlsx')

  // Feuille avec une ligne d'en-tête
  const ws = XLSX.utils.aoa_to_sheet([columns])

  // En-têtes en gras + fond gris clair
  columns.forEach((_, c) => {
    const ref = XLSX.utils.encode_cell({ r: 0, c })
    if (!ws[ref]) ws[ref] = { v: columns[c], t: 's' }
    ws[ref].s = {
      font: { bold: true, color: { rgb: '1E293B' } },
      fill: { fgColor: { rgb: 'E2E8F0' }, patternType: 'solid' },
      alignment: { horizontal: 'center' },
      border: {
        bottom: { style: 'thin', color: { rgb: '94A3B8' } },
      },
    }
  })

  // Largeur automatique : max(longueur colonne + marge, 10)
  ws['!cols'] = columns.map(col => ({ wch: Math.max(col.length + 4, 10) }))

  // Figer la première ligne
  ws['!views'] = [{ state: 'frozen', ySplit: 1 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Modèle')
  XLSX.writeFile(wb, filename, { cellStyles: true })
}

export default function ImportExcel<T extends ImportRow>({
  columns, onParse, onImport, templateFilename, label,
}: Props<T>) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<{ valid: T[]; errors: string[] } | null>(null)
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setDone(null)
    const XLSX = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<T>(ws, { defval: null })
    setPreview(onParse(rows))
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleImport() {
    if (!preview || preview.valid.length === 0) return
    setImporting(true)
    try {
      // Strip internal __warnings field before passing to onImport
      const cleanRows = preview.valid.map(row => {
        const { __warnings, ...rest } = row as any
        return rest
      }) as T[]
      await onImport(cleanRows)
      const warnedCount = (preview.valid as any[]).filter(r => r.__warnings?.length).length
      const total = preview.valid.length
      let msg = `${total} ${label} importé${total > 1 ? 's' : ''} avec succès.`
      if (warnedCount > 0) msg += ` (${warnedCount} avec données incomplètes)`
      setDone(msg)
      setPreview(null)
    } catch (err: any) {
      setDone(`Erreur : ${err?.message ?? String(err)}`)
    } finally {
      setImporting(false)
    }
  }

  // Compute counts for summary
  const warnedCount = preview ? (preview.valid as any[]).filter(r => r.__warnings?.length).length : 0
  const visibleColumns = preview?.valid.length
    ? Object.keys(preview.valid[0]).filter(k => k !== '__warnings')
    : []
  const hasWarnings = warnedCount > 0

  return (
    <div className="inline-flex items-center gap-2">
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />

      <button onClick={() => fileRef.current?.click()}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 bg-white rounded-lg hover:bg-gray-50 text-gray-700 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        Importer
      </button>

      <button onClick={() => downloadTemplate(columns, templateFilename)}
        title="Télécharger le modèle Excel"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 text-emerald-700 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Modèle
      </button>

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPreview(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[80vh] overflow-y-auto">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Aperçu de l'import</h2>

            {/* Summary line */}
            <p className="text-sm text-gray-600 mb-4 flex flex-wrap gap-x-3 gap-y-1">
              <span className="text-emerald-700 font-semibold">{preview.valid.length} {label} à importer</span>
              {hasWarnings && (
                <span className="text-orange-600 font-semibold">· {warnedCount} avec données incomplètes</span>
              )}
              {preview.errors.length > 0 && (
                <span className="text-red-600 font-semibold">· {preview.errors.length} en erreur (non importé{preview.errors.length > 1 ? 's' : ''})</span>
              )}
            </p>

            {/* Errors */}
            {preview.errors.length > 0 && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700 space-y-0.5">
                {preview.errors.map((e, i) => <div key={i}>• {e}</div>)}
              </div>
            )}

            {/* Legend */}
            {hasWarnings && (
              <div className="mb-3 flex items-center gap-2 text-xs text-orange-700">
                <span className="inline-block w-3 h-3 rounded-sm bg-orange-100 border border-orange-300 shrink-0" />
                Ligne incomplète — sera importée avec les valeurs par défaut
              </div>
            )}

            {/* Table */}
            {preview.valid.length > 0 && (
              <div className="mb-4 rounded-lg bg-gray-50 border border-gray-200 overflow-hidden overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-200">
                      {visibleColumns.map(k => (
                        <th key={k} className="px-2 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap">{k}</th>
                      ))}
                      {hasWarnings && (
                        <th className="px-2 py-1.5 text-left font-semibold text-orange-600 whitespace-nowrap">Avertissements</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.valid.slice(0, 8).map((row, i) => {
                      const rowWarnings = (row as any).__warnings as string[] | undefined
                      return (
                        <tr key={i} className={rowWarnings?.length ? 'bg-orange-50' : ''}>
                          {visibleColumns.map(k => (
                            <td key={k} className="px-2 py-1 text-gray-700 max-w-[120px] truncate">
                              {String((row as any)[k] ?? '')}
                            </td>
                          ))}
                          {hasWarnings && (
                            <td className="px-2 py-1 text-orange-600 max-w-[200px]">
                              {rowWarnings?.join(', ') ?? ''}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                    {preview.valid.length > 8 && (
                      <tr>
                        <td colSpan={99} className="px-2 py-1 text-gray-400 italic">
                          …et {preview.valid.length - 8} autres
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button onClick={() => setPreview(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={handleImport} disabled={importing || preview.valid.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50">
                {importing ? 'Import en cours…' : `Valider l'import`}
              </button>
            </div>
          </div>
        </div>
      )}

      {done && (
        <span className={`text-xs ${done.startsWith('Erreur') ? 'text-red-600' : 'text-emerald-600'}`}>{done}</span>
      )}
    </div>
  )
}
