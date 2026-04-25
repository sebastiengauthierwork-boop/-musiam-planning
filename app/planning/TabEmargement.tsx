'use client'

import { useEffect, useState } from 'react'
import type { Employee, TabProps } from './types'
import { decimalToHMin } from '@/lib/timeUtils'

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const DAYS_LONG = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']

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
function fmtNet(net: number | null | undefined): string {
  if (!net) return ''
  const h = Number(net)
  if (h <= 0) return ''
  return decimalToHMin(h)
}

export default function TabEmargement({ employees, schedules, shiftCodes, absenceCodes, year, month, teamName }: TabProps) {
  // Cadres exclus de l'émargement
  const nonCadreEmployees = employees.filter(e => e.statut !== 'cadre')

  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<string>>(
    () => new Set(nonCadreEmployees.map(e => e.id))
  )
  const [printTime, setPrintTime] = useState<Date | null>(null)

  useEffect(() => {
    const handler = () => setPrintTime(new Date())
    window.addEventListener('beforeprint', handler)
    return () => window.removeEventListener('beforeprint', handler)
  }, [])

  function handlePrint() {
    setPrintTime(new Date())
    setTimeout(() => window.print(), 30)
  }

  function toggleEmp(id: string) {
    setSelectedEmpIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const days = getDays(year, month)
  const rowH = Math.round((267 / days.length) * 3.779)

  const schedMap: Record<string, string | null> = {}
  for (const s of schedules) {
    schedMap[`${s.employee_id}|${s.date}`] = s.code ?? null
  }

  function getShiftInfo(empId: string, dateStr: string) {
    const code = schedMap[`${empId}|${dateStr}`]
    if (!code) return null
    const sc = shiftCodes.find(c => c.code === code)
    return {
      code,
      isShift: !!sc,
      start: sc?.start_time?.slice(0, 5) ?? '',
      end: sc?.end_time?.slice(0, 5) ?? '',
      net: fmtNet(sc?.net_hours),
    }
  }

  function isWeekend(d: Date): boolean { return d.getDay() === 0 || d.getDay() === 6 }

  const th = (extra?: React.CSSProperties): React.CSSProperties => ({
    border: '1px solid #94a3b8',
    padding: '4px 3px',
    textAlign: 'center',
    fontWeight: 700,
    fontSize: '7.5px',
    color: '#374151',
    background: '#f1f5f9',
    verticalAlign: 'middle',
    ...extra,
  })

  const td = (extra?: React.CSSProperties): React.CSSProperties => ({
    border: '1px solid #cbd5e1',
    padding: '4px 5px',
    fontSize: '8.5px',
    background: '#ffffff',
    textAlign: 'center',
    verticalAlign: 'middle',
    ...extra,
  })

  const tdSaisie = (bg?: string): React.CSSProperties => ({
    border: '1px solid #cbd5e1',
    padding: '4px 3px',
    background: bg ?? '#ffffff',
    verticalAlign: 'top',
  })

  const selectedEmployees = nonCadreEmployees.filter(e => selectedEmpIds.has(e.id))

  function renderSheet(emp: Employee, isLast: boolean) {
    const workingDays = days.filter(d => {
      const dateStr = toISO(d)
      if (emp.start_date && dateStr < emp.start_date) return false
      if (emp.end_date && dateStr > emp.end_date) return false
      const code = schedMap[`${emp.id}|${dateStr}`]
      return code || !isWeekend(d)
    })

    const totalH = workingDays.reduce((sum, d) => {
      const info = getShiftInfo(emp.id, toISO(d))
      const sc = info?.isShift ? shiftCodes.find(c => c.code === info.code) : null
      return sum + (sc?.net_hours ? Number(sc.net_hours) : 0)
    }, 0)
    const totalLabel = fmtNet(totalH) || '0h00'

    return (
      <div
        key={emp.id}
        style={!isLast ? { breakAfter: 'page', pageBreakAfter: 'always', marginBottom: 40 } : {}}
      >
        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <div style={{ borderBottom: '2px solid #1e293b', paddingBottom: 8, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '7px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#94a3b8' }}>
                MUSIAM · FEUILLE D'ÉMARGEMENT
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                {emp.last_name} {emp.first_name}
              </div>
              {emp.fonction && (
                <div style={{ fontSize: '9px', color: '#64748b', marginTop: 1 }}>{emp.fonction}</div>
              )}
              <div style={{ fontSize: '8px', color: '#94a3b8', marginTop: 2 }}>
                {emp.contract_type} · {emp.weekly_contract_hours ?? 35}h/sem · {teamName}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>{MONTHS[month]} {year}</div>
              <div style={{ fontSize: '7px', color: '#94a3b8', marginTop: 3 }}>
                Édité le {new Date().toLocaleDateString('fr-FR')}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10 }}>
            {[
              { label: 'Signature du salarié', value: null },
              { label: 'Visa du responsable', value: null },
              { label: 'Total heures planifiées', value: totalLabel },
            ].map(block => (
              <div key={block.label} style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '5px 8px', minHeight: 38 }}>
                <div style={{ fontSize: '7px', color: '#6b7280', marginBottom: block.value ? 2 : 18 }}>{block.label}</div>
                {block.value
                  ? <div style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>{block.value}</div>
                  : <div style={{ borderBottom: '1px solid #d1d5db' }} />}
              </div>
            ))}
          </div>
        </div>

        {/* ── TABLEAU ──────────────────────────────────────────────────────── */}
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', fontSize: '8px' }}>
          <colgroup>
            <col style={{ width: '6%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '5%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '15%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={th()}>Date</th>
              <th style={th()}>Jour</th>
              <th style={th()}>Poste</th>
              <th style={th()}>Prise de poste théo.</th>
              <th style={th()}>Fin de poste théo.</th>
              <th style={th()}>H trav. théo.</th>
              <th style={th({ background: '#fefce8', color: '#a16207' })}>H Arrivée réelle</th>
              <th style={th({ background: '#fefce8', color: '#a16207' })}>H Départ réel</th>
              <th style={th({ background: '#fefce8', color: '#a16207' })}>H Trav. réelles</th>
              <th style={th({ background: '#f0fdf4', color: '#15803d' })}>Observations</th>
              <th style={th()}>Signature salarié</th>
              <th style={th()}>Signature hiérarchie</th>
            </tr>
          </thead>
          <tbody>
            {days.map(d => {
              const dateStr = toISO(d)
              const info = getShiftInfo(emp.id, dateStr)
              const isWE = isWeekend(d)
              const rowBg = isWE ? '#f8fafc' : '#ffffff'
              return (
                <tr key={dateStr} style={{ height: rowH }}>
                  <td style={td({ background: rowBg, fontWeight: 500 })}>
                    {d.getDate().toString().padStart(2, '0')}/{String(month + 1).padStart(2, '0')}
                  </td>
                  <td style={td({ background: rowBg, textAlign: 'left', color: isWE ? '#94a3b8' : '#374151', fontStyle: isWE ? 'italic' : 'normal' })}>
                    {DAYS_LONG[d.getDay()]}
                  </td>
                  <td style={td({
                    background: rowBg,
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    color: info?.isShift ? '#1d4ed8' : info?.code ? '#15803d' : '#9ca3af',
                  })}>
                    {info?.code ?? '—'}
                  </td>
                  <td style={td({ background: rowBg, fontFamily: 'monospace', color: '#1d4ed8' })}>
                    {info?.start || '—'}
                  </td>
                  <td style={td({ background: rowBg, fontFamily: 'monospace', color: '#1d4ed8' })}>
                    {info?.end || '—'}
                  </td>
                  <td style={td({ background: rowBg, fontWeight: 600 })}>
                    {info?.net || '—'}
                  </td>
                  <td style={tdSaisie(isWE ? '#fafafa' : '#fffbeb')} />
                  <td style={tdSaisie(isWE ? '#fafafa' : '#fffbeb')} />
                  <td style={tdSaisie(isWE ? '#fafafa' : '#fffbeb')} />
                  <td style={tdSaisie(isWE ? '#fafafa' : '#f0fdf4')} />
                  <td style={tdSaisie(rowBg)} />
                  <td style={tdSaisie(rowBg)} />
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* ── FOOTER ───────────────────────────────────────────────────────── */}
        <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, border: '1px solid #fbbf24', borderRadius: 4, padding: '6px 10px', background: '#fffbeb' }}>
            <div style={{ fontSize: '7.5px', color: '#92400e', fontWeight: 700 }}>
              ⚠ Les Horaires affichés sont la prise de poste en tenue
            </div>
            <div style={{ fontSize: '7.5px', color: '#b45309', marginTop: 2 }}>
              Attention vos horaires peuvent être modifiés !
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '6.5px', color: '#9ca3af' }}>
            PLANNING ÉDITÉ LE {new Date().toLocaleDateString('fr-FR').toUpperCase()}
            <br />Imprimé le {printTime
              ? `${printTime.toLocaleDateString('fr-FR')} à ${printTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
              : new Date().toLocaleDateString('fr-FR')}
            <br />Musiam Planning
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{`@media print { @page { size: A4 portrait; margin: 8mm; } }`}</style>

      {/* ── Toolbar ── */}
      <div className="px-6 py-3 border-b border-gray-200 bg-white">
        {/* Ligne 1 : actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setSelectedEmpIds(new Set(nonCadreEmployees.map(e => e.id)))}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Sélectionner tout
          </button>
          <button
            onClick={() => setSelectedEmpIds(new Set())}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Désélectionner tout
          </button>
          <span className="text-xs text-gray-400">
            Format A4 portrait · {days.length} jours · {selectedEmpIds.size} feuille{selectedEmpIds.size > 1 ? 's' : ''} sélectionnée{selectedEmpIds.size > 1 ? 's' : ''}
          </span>
          <button
            onClick={handlePrint}
            disabled={selectedEmpIds.size === 0}
            className="ml-auto inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Imprimer {selectedEmpIds.size > 0 ? `${selectedEmpIds.size} feuille${selectedEmpIds.size > 1 ? 's' : ''}` : ''}
          </button>
        </div>

        {/* Ligne 2 : checkboxes salariés */}
        <div className="flex flex-wrap gap-2 mt-3">
          {nonCadreEmployees.map(e => (
            <label
              key={e.id}
              className="flex items-center gap-1.5 cursor-pointer px-2.5 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <input
                type="checkbox"
                checked={selectedEmpIds.has(e.id)}
                onChange={() => toggleEmp(e.id)}
                className="accent-slate-700"
              />
              <span className="text-sm text-gray-700">{e.last_name} {e.first_name}</span>
            </label>
          ))}
        </div>
      </div>

      {/* ── Zone imprimable ── */}
      <div className="print-planning-area overflow-auto p-6 bg-white">
        {selectedEmployees.length === 0 ? (
          <p className="text-gray-400 text-sm">Sélectionnez au moins un salarié.</p>
        ) : (
          selectedEmployees.map((emp, idx) =>
            renderSheet(emp, idx === selectedEmployees.length - 1)
          )
        )}
      </div>
    </>
  )
}
