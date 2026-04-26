'use client'

import { Fragment, useEffect, useState } from 'react'
import type { Employee, TabProps } from './types'
import { isTemporaire, getFnCode } from '@/lib/employeeUtils'
import { generatePlanningPdf, downloadPdf } from '@/lib/generatePlanningPdf'
import { getCodeColors, SHIFT_PALETTE, ABSENCE_COLOR } from '@/lib/codeColors'

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const DAY_LETTER = ['D','L','M','M','J','V','S']

function toISO(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function getDays(year: number, month: number): Date[] {
  const n = new Date(year, month + 1, 0).getDate()
  return Array.from({ length: n }, (_, i) => new Date(year, month, i + 1))
}

// ─── A3 style constants ──────────────────────────────────────────────────────
const S = {
  thEmp:  { background: '#f1f5f9', border: '1px solid #94a3b8', padding: '4px 6px', textAlign: 'left'  as const, fontWeight: 700, color: '#374151' },
  thDay:  { border: '1px solid #94a3b8', padding: '2px 1px', textAlign: 'center' as const, fontWeight: 700 },
  thDayWE:{ background: '#e2e8f0', color: '#64748b' },
  thDayWD:{ background: '#f1f5f9', color: '#374151' },
  tdEmp:  { border: '1px solid #cbd5e1', padding: '3px 5px', fontWeight: 600, color: '#1e293b', background: '#f8fafc', overflow: 'hidden' as const, whiteSpace: 'nowrap' as const },
  tdBase: { border: '1px solid #cbd5e1', textAlign: 'center' as const, verticalAlign: 'middle' as const, padding: '3px 1px' },
  bgWE:   '#f1f5f9',
  bgEmpty:'#ffffff',
  shiftCode: { fontWeight: 700, lineHeight: 1.2, fontSize: '6.5px', display: 'block' as const },
  shiftTime: { lineHeight: 1.1, fontSize: '5px',   display: 'block' as const },
  absCode:   { fontWeight: 700, lineHeight: 1.2, fontSize: '6.5px', display: 'block' as const },
}

export default function TabPlanning({ employees, schedules, shiftCodes, absenceCodes, jobFunctions = [], year, month, teamName }: TabProps) {
  const days = getDays(year, month)
  const [printTime, setPrintTime] = useState<Date | null>(null)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [a4Mode, setA4Mode] = useState<'off' | '1page' | '2pages'>('off')

  // A4 disponible uniquement si moins de 15 personnes
  const canA4 = employees.length < 15

  // Découpe du mois : 15 premiers jours / reste
  const daysA = days.slice(0, 15)
  const daysB = days.slice(15)

  // Hauteurs de ligne A4 pour remplir la page
  // A4 paysage ~718px utile (10mm marges). 1page : 2 tables → ~285px/table
  const a4RowH = a4Mode === '2pages'
    ? Math.min(100, Math.max(14, Math.floor(600 / Math.max(1, employees.length))))
    : Math.min(55,  Math.max(12, Math.floor(280 / Math.max(1, employees.length))))

  useEffect(() => {
    const handler = () => setPrintTime(new Date())
    window.addEventListener('beforeprint', handler)
    return () => window.removeEventListener('beforeprint', handler)
  }, [])

  function handlePrint() {
    setPrintTime(new Date())
    setTimeout(() => window.print(), 30)
  }

  async function handleGeneratePdf() {
    setGeneratingPdf(true)
    try {
      const { blob } = await generatePlanningPdf({ employees, schedules, shiftCodes, absenceCodes, year, month, teamName })
      downloadPdf(blob, `planning-${teamName.replace(/\s+/g, '-').toLowerCase()}-${MONTHS[month].toLowerCase()}-${year}.pdf`)
    } catch (err) {
      console.error('Erreur génération PDF:', err)
      alert('Erreur lors de la génération du PDF.')
    } finally {
      setGeneratingPdf(false)
    }
  }

  const schedMap: Record<string, string> = {}
  for (const s of schedules) {
    if (s.code) schedMap[`${s.employee_id}|${s.date}`] = s.code
  }

  type CellData =
    | { kind: 'shift';   line1: string; line2: string }
    | { kind: 'absence'; code: string }
    | null

  function cellData(empId: string, dateStr: string): CellData {
    const code = schedMap[`${empId}|${dateStr}`]
    if (!code) return null
    const sc = shiftCodes.find(c => c.code === code)
    if (sc) {
      const times = (sc.start_time && sc.end_time)
        ? `${sc.start_time.slice(0, 5)} ${sc.end_time.slice(0, 5)}`
        : ''
      return { kind: 'shift', line1: code, line2: times }
    }
    return { kind: 'absence', code }
  }

  function monthlyHours(emp: Employee): string {
    if (emp.statut === 'cadre') return 'Forfait'
    const h = (emp.weekly_contract_hours ?? 35) * 52 / 12
    return `${h.toFixed(2)}h`
  }

  // ── Rendu d'une demi-table A4 ────────────────────────────────────────────
  function renderHalfTable(halfDays: Date[], rowH: number) {
    const dayColW = ((100 - 11 - 4 - 4) / halfDays.length).toFixed(2)
    return (
      <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', fontSize: '9px' }}>
        <colgroup>
          <col style={{ width: '11%' }} />
          <col style={{ width: '4%' }} />
          <col style={{ width: '4%' }} />
          {halfDays.map(d => <col key={toISO(d)} style={{ width: `${dayColW}%` }} />)}
        </colgroup>
        <thead>
          <tr>
            <th style={{ background: '#f1f5f9', border: '1px solid #94a3b8', padding: '3px 5px', textAlign: 'left', fontWeight: 700, color: '#374151', fontSize: '9px' }}>
              Salarié
            </th>
            <th style={{ background: '#f1f5f9', border: '1px solid #94a3b8', padding: '2px 1px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: '7px', maxWidth: 50 }}>
              Contrat
            </th>
            <th style={{ background: '#f1f5f9', border: '1px solid #94a3b8', padding: '2px 1px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: '7px', maxWidth: 50 }}>
              H/mois
            </th>
            {halfDays.map(d => {
              const isWE = d.getDay() === 0 || d.getDay() === 6
              const isMonday = d.getDay() === 1
              return (
                <th key={toISO(d)} style={{
                  background: isWE ? '#e2e8f0' : '#f1f5f9',
                  color: isWE ? '#64748b' : '#374151',
                  border: '1px solid #94a3b8',
                  padding: '2px 1px',
                  textAlign: 'center',
                  fontWeight: 700,
                  ...(isMonday ? { borderLeft: '2px solid #374151' } : {}),
                }}>
                  <div style={{ fontSize: '7px', lineHeight: 1 }}>{DAY_LETTER[d.getDay()]}</div>
                  <div style={{ fontSize: '10px', lineHeight: 1.3, fontWeight: 700 }}>{d.getDate()}</div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {employees.map((emp, idx) => (
            <Fragment key={emp.id}>
              {idx > 0 && isTemporaire(emp.contract_type) && !isTemporaire(employees[idx - 1].contract_type) && (
                <tr>
                  <td colSpan={3 + halfDays.length} style={{ background: '#e2e8f0', height: 5, padding: 0, border: '1px solid #cbd5e1' }} />
                </tr>
              )}
            <tr style={{ height: rowH }}>
              <td style={{ border: '1px solid #cbd5e1', padding: '2px 4px', fontWeight: 600, color: '#1e293b', background: '#f8fafc', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {emp.last_name} {emp.first_name.charAt(0)}.
                {emp.fonction && (
                  <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: '6px', marginLeft: 3 }}>{getFnCode(emp.fonction, jobFunctions)}</span>
                )}
              </td>
              <td style={{ border: '1px solid #cbd5e1', padding: '2px 1px', textAlign: 'center', background: '#fafafa', fontSize: '7px', color: '#475569', fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: 50 }}>
                {emp.contract_type}
              </td>
              <td style={{ border: '1px solid #cbd5e1', padding: '2px 1px', textAlign: 'center', background: '#fafafa', fontSize: '7.5px', color: '#475569', fontWeight: 700, maxWidth: 50 }}>
                {monthlyHours(emp)}
              </td>
              {halfDays.map(d => {
                const dateStr = toISO(d)
                const isWE = d.getDay() === 0 || d.getDay() === 6
                const isMonday = d.getDay() === 1
                const blocked = (emp.start_date && dateStr < emp.start_date) || (emp.end_date && dateStr > emp.end_date)
                const cell = blocked ? null : cellData(emp.id, dateStr)
                const code = cell?.kind === 'shift' ? cell.line1 : cell?.kind === 'absence' ? cell.code : null
                const c = code ? getCodeColors(code, shiftCodes, absenceCodes) : null
                const bg = blocked ? '#e5e7eb' : c ? c.bg : (isWE ? '#f8fafc' : '#ffffff')
                return (
                  <td key={dateStr} style={{
                    border: '1px solid #cbd5e1',
                    textAlign: 'center',
                    verticalAlign: 'middle',
                    padding: '2px 1px',
                    background: bg,
                    ...(isMonday ? { borderLeft: '2px solid #374151' } : {}),
                  }}>
                    {!blocked && cell?.kind === 'shift' && (
                      <>
                        <span style={{ fontWeight: 700, fontSize: '8.5px', display: 'block', lineHeight: 1.2, color: c?.text ?? '#1e3a5f' }}>{cell.line1}</span>
                        {cell.line2 && <span style={{ fontSize: '6px', display: 'block', lineHeight: 1.1, color: c?.text ?? '#475569', opacity: 0.85 }}>{cell.line2}</span>}
                      </>
                    )}
                    {!blocked && cell?.kind === 'absence' && (
                      <span style={{ fontWeight: 700, fontSize: '8.5px', display: 'block', lineHeight: 1.2, color: c?.text ?? '#ffffff' }}>{cell.code}</span>
                    )}
                  </td>
                )
              })}
            </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    )
  }

  // ── En-tête réutilisable ─────────────────────────────────────────────────
  function pageHeader(subtitle?: string) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '2px solid #1e293b', marginBottom: 8, paddingBottom: 5 }}>
        <div>
          <div style={{ fontSize: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#94a3b8' }}>
            MUSIAM · PLANNING{subtitle ? ` · ${subtitle}` : ''}
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>
            {teamName}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#374151' }}>{MONTHS[month]} {year}</div>
          <div style={{ fontSize: '8px', fontWeight: 700, color: '#374151', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Planning édité le {new Date().toLocaleDateString('fr-FR')}
          </div>
          <div style={{ fontSize: '7px', color: '#94a3b8', marginTop: 1 }}>
            {employees.length} employé{employees.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    )
  }

  // ── Légende pied de page ─────────────────────────────────────────────────
  const footerLegend = (
    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: '7px', color: '#64748b' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {SHIFT_PALETTE.slice(0, 4).map(c => (
            <span key={c.bg} style={{ display: 'inline-block', width: 9, height: 9, background: c.bg, border: '1px solid #cbd5e1' }} />
          ))}
          <span style={{ marginLeft: 3 }}>Codes horaires</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 9, height: 9, background: ABSENCE_COLOR.bg, border: '1px solid #666' }} />
          Absence / congé
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 9, height: 9, background: S.bgWE, border: '1px solid #cbd5e1' }} />
          Week-end
        </span>
      </div>
      <div style={{ fontSize: '6.5px', color: '#94a3b8', textAlign: 'right' }}>
        Imprimé le {printTime
          ? `${printTime.toLocaleDateString('fr-FR')} à ${printTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
          : new Date().toLocaleDateString('fr-FR')}
      </div>
    </div>
  )

  // ── Largeurs colonnes A3 ─────────────────────────────────────────────────
  const empColPct = 9
  const contractColPct = 3
  const hoursColPct = 4
  const dayColPct = (100 - empColPct - contractColPct - hoursColPct) / days.length

  return (
    <>
      <style>{a4Mode !== 'off'
        ? `@media print { @page { size: A4 landscape; margin: 10mm; } }`
        : `@media print { @page { size: A3 landscape; margin: 10mm; } }`
      }</style>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 bg-white shrink-0 flex-wrap">
        <span className="text-sm text-gray-500">
          {a4Mode === 'off'
            ? 'Format A3 paysage · couleurs fidèles à l\'impression'
            : `Format A4 paysage · ${a4Mode === '1page' ? '1 page (2 quinzaines)' : '2 pages'} · ${employees.length} salarié${employees.length !== 1 ? 's' : ''}`}
        </span>

        {/* Sélecteur A4 — équipes < 15 personnes uniquement */}
        {canA4 && (
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-1 text-xs font-medium">
            {(['off', '1page', '2pages'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setA4Mode(mode)}
                className={`px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                  a4Mode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {mode === 'off' ? 'A3' : mode === '1page' ? 'A4 · 1 page' : 'A4 · 2 pages'}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleGeneratePdf}
            disabled={generatingPdf}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {generatingPdf ? 'Génération…' : 'Télécharger PDF'}
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Imprimer / PDF
          </button>
        </div>
      </div>

      {/* ── Zone imprimable ── */}
      <div className="print-planning-area overflow-auto flex-1 bg-white p-5">

        {a4Mode === 'off' ? (

          /* ── Vue A3 ─────────────────────────────────────────────────────── */
          <>
            {pageHeader()}

            <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', fontSize: '8px' }}>
              <colgroup>
                <col style={{ width: `${empColPct}%` }} />
                <col style={{ width: `${contractColPct}%` }} />
                <col style={{ width: `${hoursColPct}%` }} />
                {days.map(d => <col key={toISO(d)} style={{ width: `${dayColPct.toFixed(2)}%` }} />)}
              </colgroup>

              <thead>
                <tr>
                  <th style={S.thEmp}>Salarié</th>
                  <th style={{ background: '#f1f5f9', border: '1px solid #94a3b8', padding: '2px 1px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: '7px' }}>Contrat</th>
                  <th style={{ background: '#f1f5f9', border: '1px solid #94a3b8', padding: '2px 1px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: '7px' }}>H/mois</th>
                  {days.map(d => {
                    const isWE = d.getDay() === 0 || d.getDay() === 6
                    const isMonday = d.getDay() === 1
                    return (
                      <th key={toISO(d)} style={{
                        ...S.thDay,
                        ...(isWE ? S.thDayWE : S.thDayWD),
                        ...(isMonday ? { borderLeft: '2px solid #374151' } : {}),
                      }}>
                        <div style={{ fontSize: '6px', lineHeight: 1 }}>{DAY_LETTER[d.getDay()]}</div>
                        <div style={{ fontSize: '8px', lineHeight: 1.3, fontWeight: 700 }}>{d.getDate()}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>

              <tbody>
                {employees.map((emp, idx) => (
                  <Fragment key={emp.id}>
                    {idx > 0 && isTemporaire(emp.contract_type) && !isTemporaire(employees[idx - 1].contract_type) && (
                      <tr>
                        <td colSpan={3 + days.length} style={{ background: '#e2e8f0', height: 5, padding: 0, border: '1px solid #cbd5e1' }} />
                      </tr>
                    )}
                  <tr>
                    <td style={S.tdEmp}>
                      {emp.last_name} {emp.first_name.charAt(0)}.
                      {emp.fonction && (
                        <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: '5.5px', marginLeft: 3 }}>
                          {getFnCode(emp.fonction, jobFunctions)}
                        </span>
                      )}
                    </td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '2px 1px', textAlign: 'center', background: '#fafafa', fontSize: '6.5px', color: '#475569', fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {emp.contract_type}
                    </td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '2px 1px', textAlign: 'center', background: '#fafafa', fontSize: '7px', color: '#475569', fontWeight: 700 }}>
                      {monthlyHours(emp)}
                    </td>
                    {days.map(d => {
                      const dateStr = toISO(d)
                      const isWE = d.getDay() === 0 || d.getDay() === 6
                      const isMonday = d.getDay() === 1
                      const blocked = (emp.start_date && dateStr < emp.start_date) || (emp.end_date && dateStr > emp.end_date)
                      const cell = blocked ? null : cellData(emp.id, dateStr)
                      const code = cell?.kind === 'shift' ? cell.line1 : cell?.kind === 'absence' ? cell.code : null
                      const c = code ? getCodeColors(code, shiftCodes, absenceCodes) : null
                      const bg = blocked ? '#e5e7eb' : c ? c.bg : S.bgEmpty
                      return (
                        <td key={dateStr} style={{
                          ...S.tdBase,
                          background: bg,
                          ...(isMonday ? { borderLeft: '2px solid #374151' } : {}),
                        }}>
                          {!blocked && cell?.kind === 'shift' && (
                            <>
                              <span style={{ ...S.shiftCode, color: c?.text ?? '#1e3a5f' }}>{cell.line1}</span>
                              {cell.line2 && <span style={{ ...S.shiftTime, color: c?.text ?? '#475569', opacity: 0.8 }}>{cell.line2}</span>}
                            </>
                          )}
                          {!blocked && cell?.kind === 'absence' && (
                            <span style={{ ...S.absCode, color: c?.text ?? '#ffffff' }}>{cell.code}</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>

            {footerLegend}
          </>

        ) : (

          /* ── Vue A4 paysage ─────────────────────────────────────────────── */
          <>
            {/* Première quinzaine */}
            {pageHeader('jours 1–15')}
            {renderHalfTable(daysA, a4RowH)}

            {/* Séparateur ou saut de page */}
            {a4Mode === '2pages' ? (
              <div style={{ breakAfter: 'page', pageBreakAfter: 'always' }} />
            ) : (
              <div style={{ margin: '10px 0 8px', borderTop: '1px dashed #e2e8f0' }} />
            )}

            {/* Deuxième quinzaine */}
            {a4Mode === '2pages' && pageHeader(`jours 16–${days.length}`)}
            {renderHalfTable(daysB, a4RowH)}

            {footerLegend}
          </>

        )}
      </div>
    </>
  )
}
