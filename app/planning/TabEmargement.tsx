'use client'

import { useEffect, useState } from 'react'
import type { TabProps } from './types'
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

// Group month days by calendar week (Mon–Sun), return ordered list
function buildWeeksGrid(days: Date[]): { label: string; dates: (Date | null)[] }[] {
  const weekMap = new Map<string, (Date | null)[]>()
  const weekOrder: string[] = []
  for (const d of days) {
    const dow = (d.getDay() + 6) % 7 // 0=Mon, 6=Sun
    const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow)
    const key = `${mon.getFullYear()}-${mon.getMonth()}-${mon.getDate()}`
    if (!weekMap.has(key)) {
      weekMap.set(key, [null, null, null, null, null, null, null])
      weekOrder.push(key)
    }
    weekMap.get(key)![dow] = d
  }
  return weekOrder.map((key, i) => ({ label: `S${i + 1}`, dates: weekMap.get(key)! }))
}

export default function TabEmargement({ employees, schedules, shiftCodes, absenceCodes, year, month, teamName }: TabProps) {
  const [selectedEmpId, setSelectedEmpId] = useState<string>(employees[0]?.id ?? '')
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
  const days = getDays(year, month)
  const emp = employees.find(e => e.id === selectedEmpId)

  // Schedule map: "empId|date" → code
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

  const workingDays = days.filter(d => {
    const code = schedMap[`${selectedEmpId}|${toISO(d)}`]
    return code || !isWeekend(d)
  })

  const totalH = emp ? workingDays.reduce((sum, d) => {
    const info = getShiftInfo(emp.id, toISO(d))
    const sc = info?.isShift ? shiftCodes.find(c => c.code === info.code) : null
    return sum + (sc?.net_hours ? Number(sc.net_hours) : 0)
  }, 0) : 0
  const totalLabel = fmtNet(totalH) || '0h00'

  const weeksGrid = emp ? buildWeeksGrid(days) : []

  // ─── Inline style helpers (print fidelity) ────────────────────────────────

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
    padding: '18px 4px 4px',
    background: bg ?? '#ffffff',
  })

  return (
    <>
      {/* A4 portrait override — active only when this tab is mounted */}
      <style>{`@media print { @page { size: A4 portrait; margin: 12mm; } }`}</style>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-gray-200 bg-white">
        <label className="text-sm font-medium text-gray-700">Employé :</label>
        <select
          value={selectedEmpId}
          onChange={e => setSelectedEmpId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 text-gray-700"
        >
          {employees.map(e => (
            <option key={e.id} value={e.id}>{e.last_name} {e.first_name}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400">Format A4 portrait · {workingDays.length} lignes</span>
        <button onClick={handlePrint}
          className="ml-auto inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Imprimer
        </button>
      </div>

      {/* ── Printable area ── */}
      <div className="print-planning-area overflow-auto p-6 bg-white">
        {!emp ? (
          <p className="text-gray-400 text-sm">Sélectionnez un employé.</p>
        ) : (
          <>
            {/* ── 1. HEADER ─────────────────────────────────────────────── */}
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

              {/* Signature + total blocks */}
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

            {/* ── 2. RÉCAP SEMAINES ─────────────────────────────────────── */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: '6.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', marginBottom: 3 }}>
                Récapitulatif — Planning du mois
              </div>
              <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', fontSize: '7px' }}>
                <colgroup>
                  <col style={{ width: '6%' }} />
                  {[0,1,2,3,4,5,6].map(i => <col key={i} style={{ width: `${94/7}%` }} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th style={th({ textAlign: 'left', fontSize: '6.5px', background: '#f8fafc' })}>Sem.</th>
                    {['L','M','Me','J','V','S','D'].map((label, i) => (
                      <th key={label} style={th({ background: i >= 5 ? '#e2e8f0' : '#f1f5f9', color: i >= 5 ? '#64748b' : '#374151' })}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeksGrid.map(week => (
                    <tr key={week.label}>
                      <td style={{ border: '1px solid #cbd5e1', padding: '2px 4px', fontWeight: 700, color: '#374151', background: '#f8fafc', fontSize: '6.5px' }}>
                        {week.label}
                      </td>
                      {week.dates.map((d, i) => {
                        if (!d) return (
                          <td key={i} style={{ border: '1px solid #cbd5e1', background: i >= 5 ? '#f1f5f9' : '#f8fafc' }} />
                        )
                        const dateStr = toISO(d)
                        const info = getShiftInfo(emp.id, dateStr)
                        const isWE = i >= 5
                        const sc = info?.isShift ? shiftCodes.find(c => c.code === info.code) : null
                        const bg = isWE ? '#f1f5f9' : sc ? '#dbeafe' : info?.code ? '#dcfce7' : '#ffffff'
                        const codeColor = sc ? '#1d4ed8' : info?.code ? '#15803d' : '#9ca3af'
                        return (
                          <td key={i} style={{ border: '1px solid #cbd5e1', background: bg, textAlign: 'center', padding: '1px 2px', verticalAlign: 'top' }}>
                            <div style={{ fontSize: '5.5px', color: '#9ca3af', lineHeight: 1.2 }}>{d.getDate()}</div>
                            <div style={{ fontSize: '6.5px', fontWeight: info?.code ? 700 : 400, color: codeColor, lineHeight: 1.3 }}>
                              {info?.code ?? (isWE ? '—' : '')}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── 3. TABLEAU PRINCIPAL ──────────────────────────────────── */}
            <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', fontSize: '8px' }}>
              <colgroup>
                <col style={{ width: '7%' }} />   {/* Date */}
                <col style={{ width: '9%' }} />   {/* Jour */}
                <col style={{ width: '5%' }} />   {/* Poste */}
                <col style={{ width: '7%' }} />   {/* Prise théo */}
                <col style={{ width: '7%' }} />   {/* Départ théo */}
                <col style={{ width: '6%' }} />   {/* H théo */}
                <col style={{ width: '7%' }} />   {/* H Arrivée */}
                <col style={{ width: '7%' }} />   {/* H Départ */}
                <col style={{ width: '6%' }} />   {/* H Trav */}
                <col style={{ width: '15%' }} />  {/* Observations */}
                <col style={{ width: '12%' }} />  {/* Sig salarié */}
                <col style={{ width: '12%' }} />  {/* Sig hiérarchie */}
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
                {workingDays.map(d => {
                  const dateStr = toISO(d)
                  const info = getShiftInfo(emp.id, dateStr)
                  const isWE = isWeekend(d)
                  const rowBg = isWE ? '#f8fafc' : '#ffffff'
                  return (
                    <tr key={dateStr}>
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

            {/* ── 4. FOOTER ─────────────────────────────────────────────── */}
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
          </>
        )}
      </div>
    </>
  )
}
