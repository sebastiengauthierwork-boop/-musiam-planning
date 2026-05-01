'use client'

import { Fragment, useState, useMemo } from 'react'
import type { TabProps } from './types'
import { getCodeColors } from '@/lib/codeColors'
import { STATUT_ORDER } from '@/lib/employeeUtils'

function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function timeToMin(t: string | null | undefined): number {
  if (!t) return -1
  const parts = t.split(':').map(Number)
  return parts[0] * 60 + (parts[1] || 0)
}

export default function TabFeuilleJour({
  employees, schedules, shiftCodes, absenceCodes, teamName, year, month,
}: TabProps) {
  const today = new Date()
  const todayISO = toISO(today)
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`
  const defaultDate = todayISO.startsWith(monthStr) ? todayISO : `${monthStr}-01`
  const [selectedDate, setSelectedDate] = useState(defaultDate)

  const schedMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const s of schedules) {
      if (s.code) map[`${s.employee_id}|${s.date}`] = s.code
    }
    return map
  }, [schedules])

  const presentEmployees = useMemo(() => {
    return employees
      .filter(emp => {
        if (emp.start_date && selectedDate < emp.start_date) return false
        if (emp.end_date && selectedDate > emp.end_date) return false
        const code = schedMap[`${emp.id}|${selectedDate}`]
        if (!code) return false
        return shiftCodes.some(sc => sc.code === code)
      })
      .sort((a, b) => {
        const oa = STATUT_ORDER[a.statut ?? ''] ?? 3
        const ob = STATUT_ORDER[b.statut ?? ''] ?? 3
        if (oa !== ob) return oa - ob
        return (a.last_name || '').localeCompare(b.last_name || '')
      })
  }, [employees, schedMap, selectedDate, shiftCodes])

  const { ganttStart, ganttEnd } = useMemo(() => {
    let minStart = 23 * 60
    let maxEnd = 6 * 60
    let hasData = false
    for (const emp of presentEmployees) {
      const code = schedMap[`${emp.id}|${selectedDate}`]
      const sc = shiftCodes.find(s => s.code === code)
      if (!sc) continue
      const st = timeToMin(sc.start_time)
      const et = timeToMin(sc.end_time)
      if (st >= 0) { minStart = Math.min(minStart, st); hasData = true }
      if (et >= 0) { maxEnd = Math.max(maxEnd, et); hasData = true }
    }
    if (!hasData) return { ganttStart: 6 * 60, ganttEnd: 22 * 60 }
    const start = Math.max(0, Math.floor((minStart - 30) / 60) * 60)
    const end = Math.min(24 * 60, Math.ceil((maxEnd + 30) / 60) * 60)
    return { ganttStart: start, ganttEnd: end }
  }, [presentEmployees, schedMap, selectedDate, shiftCodes])

  const ganttDuration = ganttEnd - ganttStart

  const hours: number[] = []
  for (let h = ganttStart; h <= ganttEnd; h += 60) hours.push(h)

  const dateLabel = new Date(selectedDate + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <>
      <style>{`@media print { @page { size: A4 portrait; margin: 10mm; } .print-gantt-area { position: static !important; overflow: visible !important; height: auto !important; } }`}</style>

      {/* Toolbar — masqué à l'impression */}
      <div className="no-print flex items-center gap-3 px-6 py-3 border-b border-gray-200 bg-white shrink-0 flex-wrap">
        <span className="text-sm font-medium text-gray-700">Feuille du jour :</span>
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        <span className="text-sm text-gray-500">
          {presentEmployees.length} présent{presentEmployees.length !== 1 ? 's' : ''}
        </span>
        <div className="ml-auto">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Imprimer
          </button>
        </div>
      </div>

      {/* Zone imprimable */}
      <div className="print-gantt-area overflow-auto flex-1 bg-white" style={{ padding: '16px 24px' }}>

        {/* En-tête */}
        <div style={{ borderBottom: '2px solid #1e293b', marginBottom: 14, paddingBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#94a3b8' }}>
              MUSIAM · FEUILLE D&apos;ÉQUIPE DU JOUR
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>
              {teamName}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'capitalize' }}>{dateLabel}</div>
            <div style={{ fontSize: '8px', color: '#94a3b8', marginTop: 2 }}>
              {presentEmployees.length} présent{presentEmployees.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {presentEmployees.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0', fontSize: '14px' }}>
            Aucun salarié présent ce jour
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '18%' }} />
              <col style={{ width: '52%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 700, color: '#374151', borderBottom: '2px solid #cbd5e1', fontSize: '8px', borderRight: '1px solid #e2e8f0' }}>
                  Salarié
                </th>
                <th style={{ padding: 0, borderBottom: '2px solid #cbd5e1', borderRight: '1px solid #cbd5e1', verticalAlign: 'bottom' }}>
                  {/* Axe horaire */}
                  <div style={{ position: 'relative', height: 22, padding: '0 4px' }}>
                    {hours.map(h => {
                      const pct = ((h - ganttStart) / ganttDuration) * 100
                      return (
                        <span key={h} style={{ position: 'absolute', left: `${pct}%`, bottom: 3, transform: 'translateX(-50%)', fontSize: '7px', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {String(Math.floor(h / 60)).padStart(2, '0')}h
                        </span>
                      )
                    })}
                  </div>
                </th>
                <th colSpan={3} style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 700, color: '#374151', borderBottom: '2px solid #cbd5e1', fontSize: '8px', borderLeft: '1px solid #cbd5e1' }}>
                  Postes
                </th>
              </tr>
            </thead>
            <tbody>
              {presentEmployees.map((emp, idx) => {
                const code = schedMap[`${emp.id}|${selectedDate}`]!
                const sc = shiftCodes.find(s => s.code === code)
                const colors = getCodeColors(code, shiftCodes, absenceCodes)
                const startMin = timeToMin(sc?.start_time)
                const endMin = timeToMin(sc?.end_time)
                const hasBar = startMin >= 0 && endMin > startMin
                const barLeft = hasBar ? Math.max(0, ((startMin - ganttStart) / ganttDuration) * 100) : 0
                const barRight = hasBar ? Math.max(0, ((ganttEnd - endMin) / ganttDuration) * 100) : 100
                const isEven = idx % 2 === 0
                const prevEmp = presentEmployees[idx - 1]
                const showSep = idx > 0 && (prevEmp?.statut ?? '') !== (emp.statut ?? '')

                return (
                  <Fragment key={emp.id}>
                    {showSep && (
                      <tr>
                        <td colSpan={5} style={{ height: 5, background: '#f1f5f9', border: 'none', padding: 0 }} />
                      </tr>
                    )}
                    <tr style={{ background: isEven ? '#f8fafc' : '#ffffff', height: 28 }}>
                      <td style={{ padding: '3px 6px', fontWeight: 600, color: '#1e293b', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                        <div style={{ fontWeight: 700, fontSize: '9px', lineHeight: 1.3 }}>{emp.last_name} {emp.first_name.charAt(0)}.</div>
                        {sc?.start_time && (
                          <div style={{ fontSize: '7px', color: '#94a3b8', lineHeight: 1.2 }}>
                            {code} · {sc.start_time.slice(0, 5)}–{sc.end_time?.slice(0, 5) ?? '?'}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '3px 4px', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #cbd5e1', position: 'relative', verticalAlign: 'middle' }}>
                        {/* Lignes de grille horaire */}
                        {hours.map(h => {
                          const pct = ((h - ganttStart) / ganttDuration) * 100
                          return (
                            <div key={h} style={{ position: 'absolute', left: `${pct}%`, top: 0, bottom: 0, borderLeft: '1px solid #e5e7eb', zIndex: 0 }} />
                          )
                        })}
                        {/* Barre Gantt */}
                        {hasBar && (
                          <div style={{
                            position: 'absolute',
                            top: '20%',
                            bottom: '20%',
                            left: `${barLeft}%`,
                            right: `${barRight}%`,
                            background: colors?.bg ?? '#6366f1',
                            borderRadius: 3,
                            zIndex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            paddingLeft: 5,
                            minWidth: 4,
                          }}>
                            <span style={{ fontSize: '7px', fontWeight: 700, color: colors?.text ?? '#fff', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                              {sc!.start_time!.slice(0, 5)}
                            </span>
                          </div>
                        )}
                        {!hasBar && code && (
                          <div style={{ position: 'absolute', top: '20%', bottom: '20%', left: '5%', right: '5%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors?.bg ?? '#e5e7eb', borderRadius: 3, zIndex: 1 }}>
                            <span style={{ fontSize: '7px', fontWeight: 700, color: colors?.text ?? '#374151' }}>{code}</span>
                          </div>
                        )}
                      </td>
                      {[0, 1, 2].map(i => (
                        <td key={i} style={{ borderBottom: '1px solid #e2e8f0', borderLeft: i === 0 ? '1px solid #cbd5e1' : '1px solid #e2e8f0' }} />
                      ))}
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}

        {/* Mention légale bas de page */}
        <div style={{ marginTop: 14, fontSize: '9px', color: '#9ca3af', textAlign: 'left' }}>
          Les horaires indiqués correspondent à la prise de poste en tenue. Un temps d&apos;habillage de 10 minutes par jour est comptabilisé en sus des horaires affichés.
        </div>
      </div>
    </>
  )
}
