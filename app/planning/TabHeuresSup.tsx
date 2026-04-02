'use client'

import type { TabProps } from './types'
import { decimalToHMin, fmtEcartHMin } from '@/lib/timeUtils'

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

function fmtH(h: number): string { return decimalToHMin(h) }
function fmtEcart(h: number): string { return fmtEcartHMin(h) }

export default function TabHeuresSup({ employees, schedules, shiftCodes, year, month, teamName }: TabProps) {
  // planned hours per employee
  const plannedMap: Record<string, number> = {}
  for (const s of schedules) {
    const sc = shiftCodes.find(c => c.code === s.code)
    if (sc?.net_hours) {
      plannedMap[s.employee_id] = (plannedMap[s.employee_id] ?? 0) + Number(sc.net_hours)
    }
  }

  type Row = {
    id: string
    name: string
    fonction: string | null
    weeklyH: number
    contractH: number
    plannedH: number
    ecart: number
    status: 'N' | 'I' | 'S'
    cost: number | null
  }

  const rows: Row[] = employees.map(emp => {
    const weeklyH = emp.weekly_contract_hours ?? 35
    const contractH = Math.round(weeklyH * 52 / 12 * 100) / 100
    const plannedH = Math.round((plannedMap[emp.id] ?? 0) * 100) / 100
    const ecart = Math.round((plannedH - contractH) * 100) / 100
    const status: 'N' | 'I' | 'S' = Math.abs(ecart) <= 1 ? 'N' : ecart < 0 ? 'I' : 'S'
    const cost = emp.hourly_rate != null && ecart !== 0
      ? Math.round(ecart * emp.hourly_rate * 100) / 100
      : null
    return {
      id: emp.id,
      name: `${emp.last_name} ${emp.first_name}`,
      fonction: emp.fonction ?? null,
      weeklyH,
      contractH,
      plannedH,
      ecart,
      status,
      cost,
    }
  })

  const totalContract = rows.reduce((s, r) => s + r.contractH, 0)
  const totalPlanned  = rows.reduce((s, r) => s + r.plannedH, 0)
  const totalEcart    = Math.round((totalPlanned - totalContract) * 100) / 100
  const hasCost       = rows.some(r => r.cost !== null)
  const totalCost     = hasCost ? rows.reduce((s, r) => s + (r.cost ?? 0), 0) : null

  const badgeClass: Record<string, string> = {
    N: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    I: 'bg-red-50 text-red-700 border-red-200',
    S: 'bg-amber-50 text-amber-700 border-amber-200',
  }
  const ecartClass = (e: number) =>
    Math.abs(e) <= 1 ? 'text-emerald-600' : e < 0 ? 'text-red-600' : 'text-amber-600'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-auto p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-gray-900">{teamName} · {MONTHS[month]} {year}</h2>
          <p className="text-xs text-gray-400 mt-0.5">Contrat mensuel = heures hebdo × 52 / 12</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Employé', 'Contrat hebdo', 'Contrat mois', 'Planifié', 'Écart', 'Statut', 'Coût écart'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider first:text-left [&:not(:first-child)]:text-center">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <span className="font-semibold text-gray-800">{row.name.split(' ')[0]}</span>{' '}
                    <span className="text-gray-500">{row.name.split(' ').slice(1).join(' ')}</span>
                    {row.fonction && <span className="ml-2 text-gray-400 text-xs">· {row.fonction}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center text-gray-500 font-mono text-xs">{row.weeklyH}h/sem</td>
                  <td className="px-4 py-2.5 text-center text-gray-600 font-mono text-xs">{fmtH(row.contractH)}</td>
                  <td className="px-4 py-2.5 text-center font-semibold text-gray-800 font-mono text-xs">{fmtH(row.plannedH)}</td>
                  <td className={`px-4 py-2.5 text-center font-semibold font-mono text-xs ${ecartClass(row.ecart)}`}>
                    {fmtEcart(row.ecart)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${badgeClass[row.status]}`}>
                      {row.status === 'N' ? 'Normal' : row.status === 'I' ? 'Insuffisant' : 'Surplus'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center text-xs font-mono">
                    {row.cost !== null ? (
                      <span className={row.cost > 0 ? 'text-amber-600 font-semibold' : row.cost < 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}>
                        {row.cost >= 0 ? '+' : ''}{row.cost.toFixed(2)} €
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr>
                <td className="px-4 py-2.5 font-semibold text-gray-600 text-sm">
                  Total équipe ({employees.length} emp.)
                </td>
                <td />
                <td className="px-4 py-2.5 text-center font-semibold text-gray-700 font-mono text-xs">{fmtH(totalContract)}</td>
                <td className="px-4 py-2.5 text-center font-semibold text-gray-700 font-mono text-xs">{fmtH(totalPlanned)}</td>
                <td className={`px-4 py-2.5 text-center font-bold font-mono text-xs ${ecartClass(totalEcart)}`}>
                  {fmtEcart(totalEcart)}
                </td>
                <td />
                <td className="px-4 py-2.5 text-center font-bold font-mono text-xs">
                  {totalCost !== null ? (
                    <span className={totalCost > 0 ? 'text-amber-600' : totalCost < 0 ? 'text-red-600' : 'text-gray-400'}>
                      {totalCost >= 0 ? '+' : ''}{totalCost.toFixed(2)} €
                    </span>
                  ) : <span className="text-gray-300">—</span>}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex items-center gap-5 mt-4 text-xs text-gray-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-100 border border-emerald-200" />
            N = Normal (écart ≤ 1h)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-100 border border-red-200" />
            I = Insuffisant (heures manquantes)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-100 border border-amber-200" />
            S = Surplus (heures supplémentaires)
          </span>
          {!hasCost && (
            <span className="ml-auto text-gray-300">Coût écart : renseignez le taux horaire dans Employés</span>
          )}
        </div>
      </div>
    </div>
  )
}
