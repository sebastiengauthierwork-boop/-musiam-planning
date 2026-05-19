'use client'

import { useRef, useState } from 'react'

export type ColumnDef = {
  key: string
  label: string
  required?: boolean
  example?: string | number
  dropdown?: string[]
  aliases?: string[]
}

export type ImportRow = Record<string, string | number | boolean | null>

type Props<T extends ImportRow> = {
  columns: ColumnDef[]
  onParse: (rows: T[]) => { valid: T[]; errors: string[] }
  onImport: (rows: T[]) => Promise<void>
  templateFilename: string
  label: string
}

// Normalise une chaine pour la comparaison flexible de noms de colonnes
function normalizeHeader(s: string): string {
  return String(s)
    .normalize(‘NFD’).replace(/[̀-ͯ]/g, ‘’)  // enlève les accents
    .replace(/[‘‘’ʼ]/g, ‘ ‘)            // apostrophes → espace
    .replace(/[*"`()/\\]/g, ‘’)                        // ponctuations inutiles
    .toLowerCase()
    .replace(/\s+/g, ‘ ‘)
    .trim()
}

async function downloadTemplate(columns: ColumnDef[], filename: string) {
  const XLSX = await import('xlsx')

  const headers = columns.map(c => c.required ? `${c.label} *` : c.label)
  const examples = columns.map(c => c.example != null ? String(c.example) : '')

  const ws = XLSX.utils.aoa_to_sheet([headers, examples])

  // Style ligne d'en-tête : fond bleu foncé, texte blanc, gras
  headers.forEach((_, c) => {
    const ref = XLSX.utils.encode_cell({ r: 0, c })
    if (!ws[ref]) ws[ref] = { v: headers[c], t: 's' }
    ws[ref].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
      fill: { fgColor: { rgb: '1E3A5F' }, patternType: 'solid' },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'thin', color: { rgb: '3B6CA0' } } },
    }
  })

  // Style ligne d'exemple : fond gris clair, texte gris italique
  examples.forEach((_, c) => {
    const ref = XLSX.utils.encode_cell({ r: 1, c })
    if (!ws[ref]) ws[ref] = { v: examples[c], t: 's' }
    ws[ref].s = {
      font: { italic: true, color: { rgb: '9CA3AF' }, sz: 9 },
      fill: { fgColor: { rgb: 'F9FAFB' }, patternType: 'solid' },
    }
  })

  // Listes déroulantes (data validation)
  const validations: any[] = []
  columns.forEach((col, c) => {
    if (col.dropdown && col.dropdown.length > 0) {
      const colLetter = XLSX.utils.encode_col(c)
      validations.push({
        sqref: `${colLetter}3:${colLetter}10000`,
        type: 'list',
        formula1: `"${col.dropdown.join(',')}"`,
        showErrorMessage: true,
        errorTitle: 'Valeur invalide',
        error: `Valeurs acceptées : ${col.dropdown.join(', ')}`,
        errorStyle: 'stop',
      })
    }
  })
  if (validations.length > 0) {
    try { (ws as any)['!dataValidations'] = validations } catch {}
  }

  ws['!cols'] = columns.map(col => ({
    wch: Math.max((col.required ? col.label.length + 2 : col.label.length) + 4, 12),
  }))
  ws['!views'] = [{ state: 'frozen', ySplit: 1 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Modèle')

  // Feuille aide avec les listes de valeurs
  const helpRows: any[][] = [['Colonne', 'Valeurs acceptées']]
  columns.filter(c => c.dropdown).forEach(c => {
    helpRows.push([c.label, c.dropdown!.join(' / ')])
  })
  if (helpRows.length > 1) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(helpRows), 'Aide')
  }

  XLSX.writeFile(wb, filename, { cellStyles: true })
}

async function parseFileRows<T extends ImportRow>(
  file: File,
  columns: ColumnDef[],
): Promise<{ rows: T[]; missingRequired: string[] }> {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: false })
  const ws = wb.Sheets[wb.SheetNames[0]]

  const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })
  if (!raw.length) return { rows: [], missingRequired: [] }

  // Construire la map alias → clé interne
  const aliasMap: Record<string, string> = {}
  for (const col of columns) {
    const allNames = [col.key, col.label, ...(col.aliases ?? [])]
    for (const name of allNames) {
      aliasMap[normalizeHeader(name)] = col.key
    }
  }

  // Chercher la ligne d'en-tête parmi les 5 premières lignes
  let headerRowIdx = -1
  let colMap: Record<number, string> = {}

  for (let i = 0; i < Math.min(raw.length, 5); i++) {
    const row = raw[i]
    const map: Record<number, string> = {}
    for (let c = 0; c < row.length; c++) {
      const n = normalizeHeader(String(row[c] ?? ''))
      if (n && aliasMap[n]) map[c] = aliasMap[n]
    }
    if (Object.keys(map).length >= 1) {
      headerRowIdx = i
      colMap = map
      break
    }
  }

  if (headerRowIdx === -1) return { rows: [], missingRequired: columns.filter(c => c.required).map(c => c.label) }

  // Colonnes obligatoires manquantes
  const foundKeys = new Set(Object.values(colMap))
  const missingRequired = columns.filter(c => c.required && !foundKeys.has(c.key)).map(c => c.label)

  // Valeurs de la ligne d'exemple (pour la détecter et l'ignorer)
  const exampleByKey: Record<string, string> = {}
  for (const col of columns) {
    if (col.example != null && String(col.example).trim() !== '') {
      exampleByKey[col.key] = normalizeHeader(String(col.example))
    }
  }

  const rows: T[] = []
  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const rawRow = raw[i]

    // Ignorer les lignes complètement vides
    if (!rawRow.some(cell => String(cell ?? '').trim() !== '')) continue

    // Construire l'objet ligne avec les clés internes
    const row: Record<string, any> = {}
    for (const [idxStr, key] of Object.entries(colMap)) {
      const val = rawRow[parseInt(idxStr)]
      const strVal = String(val ?? '').trim()
      row[key] = strVal !== '' ? strVal : null
    }

    // Ignorer la ligne d'exemple du template si tous les champs correspondent
    const exampleKeys = Object.keys(exampleByKey)
    if (exampleKeys.length > 0) {
      const isExample = exampleKeys.every(k => {
        const v = normalizeHeader(String(row[k] ?? ''))
        return v === '' || v === exampleByKey[k]
      })
      const hasAnyValue = Object.values(row).some(v => v !== null && v !== '')
      if (isExample && hasAnyValue) continue
    }

    // Ignorer les lignes qui ressemblent à un en-tête répété
    const firstKey = colMap[Object.keys(colMap).map(Number).sort((a, b) => a - b)[0]]
    if (firstKey && row[firstKey] !== null) {
      const n = normalizeHeader(String(row[firstKey] ?? ''))
      if (aliasMap[n]) continue
    }

    rows.push(row as T)
  }

  return { rows, missingRequired }
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
    try {
      const { rows, missingRequired } = await parseFileRows<T>(file, columns)
      if (missingRequired.length > 0) {
        setPreview({
          valid: [],
          errors: missingRequired.map(col => `Colonne "${col}" non trouvée dans le fichier`),
        })
      } else {
        setPreview(onParse(rows))
      }
    } catch (err: any) {
      setPreview({ valid: [], errors: [`Erreur de lecture : ${err?.message ?? String(err)}`] })
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleImport() {
    if (!preview || preview.valid.length === 0) return
    setImporting(true)
    try {
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

  const warnedCount = preview ? (preview.valid as any[]).filter(r => r.__warnings?.length).length : 0
  const erroredCount = preview?.errors.length ?? 0
  const visibleColumns = preview?.valid.length
    ? Object.keys(preview.valid[0]).filter(k => k !== '__warnings')
    : []

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

      {/* Modale de prévisualisation */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPreview(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 p-6 max-h-[80vh] overflow-y-auto">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Aperçu de l'import</h2>

            {/* Compteur */}
            <p className="text-sm text-gray-600 mb-4 flex flex-wrap gap-x-3 gap-y-1">
              <span className="text-emerald-700 font-semibold">{preview.valid.length} {label} à importer</span>
              {warnedCount > 0 && (
                <span className="text-orange-600 font-semibold">· {warnedCount} avertissement{warnedCount > 1 ? 's' : ''}</span>
              )}
              {erroredCount > 0 && (
                <span className="text-red-600 font-semibold">· {erroredCount} en erreur (ignoré{erroredCount > 1 ? 's' : ''})</span>
              )}
            </p>

            {/* Erreurs */}
            {preview.errors.length > 0 && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700 space-y-0.5">
                {preview.errors.map((e, i) => <div key={i}>• {e}</div>)}
              </div>
            )}

            {/* Légende avertissements */}
            {warnedCount > 0 && (
              <div className="mb-3 flex items-center gap-2 text-xs text-orange-700">
                <span className="inline-block w-3 h-3 rounded-sm bg-orange-100 border border-orange-300 shrink-0" />
                Ligne incomplète — sera importée avec les valeurs par défaut
              </div>
            )}

            {/* Tableau */}
            {preview.valid.length > 0 && (
              <div className="mb-4 rounded-lg bg-gray-50 border border-gray-200 overflow-hidden overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-200">
                      {visibleColumns.map(k => {
                        const colDef = columns.find(c => c.key === k)
                        return (
                          <th key={k} className="px-2 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap">
                            {colDef?.label ?? k}{colDef?.required ? ' *' : ''}
                          </th>
                        )
                      })}
                      {warnedCount > 0 && (
                        <th className="px-2 py-1.5 text-left font-semibold text-orange-600 whitespace-nowrap">Avertissements</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.valid.slice(0, 8).map((row, i) => {
                      const rowWarnings = (row as any).__warnings as string[] | undefined
                      return (
                        <tr key={i} className={rowWarnings?.length ? 'bg-orange-50' : 'bg-white'}>
                          {visibleColumns.map(k => (
                            <td key={k} className="px-2 py-1 text-gray-700 max-w-[140px] truncate">
                              {String((row as any)[k] ?? '')}
                            </td>
                          ))}
                          {warnedCount > 0 && (
                            <td className="px-2 py-1 text-orange-600 max-w-[200px] text-xs">
                              {rowWarnings?.join(', ') ?? ''}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                    {preview.valid.length > 8 && (
                      <tr>
                        <td colSpan={99} className="px-2 py-1 text-gray-400 italic">
                          …et {preview.valid.length - 8} autres lignes
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
                {importing ? 'Import en cours…' : `Valider l'import (${preview.valid.length})`}
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
