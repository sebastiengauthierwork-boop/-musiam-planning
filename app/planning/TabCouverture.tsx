'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Employee, TabProps, Team } from './types'

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const DAY_ABBR = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam']

type CoverageNeed = {
  id: string
  date: string
  team_id: string
  absent_employee_id: string | null
  shift_code: string | null
  shift_code_id: string | null
  status: 'open' | 'assigned' | 'closed'
  assigned_to: string | null
  temp_worker_id: string | null
}

type TempWorker = {
  id: string
  first_name: string
  last_name: string
  agency: string | null
  active: boolean
  team_id: string
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${DAY_ABBR[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

const STATUS_LABEL: Record<string, string> = {
  open:     '🔴 À pourvoir',
  assigned: '🟡 Assigné',
  closed:   '✅ Fermé',
}

export default function TabCouverture({ employees, year, month, teamId, teams }: TabProps) {
  const [needs, setNeeds] = useState<CoverageNeed[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Assign modal
  const [assignModal, setAssignModal] = useState<CoverageNeed | null>(null)
  const [assignMode, setAssignMode] = useState<'internal' | 'interim'>('internal')
  const [internalEmpId, setInternalEmpId] = useState('')
  const [tempWorkerId, setTempWorkerId] = useState('')
  const [tempWorkers, setTempWorkers] = useState<TempWorker[]>([])
  const [assigning, setAssigning] = useState(false)

  // Month selector (uses parent year/month as default)
  const [viewYear, setViewYear]   = useState(year)
  const [viewMonth, setViewMonth] = useState(month)

  const loadNeeds = useCallback(async () => {
    if (!teamId) return
    setLoading(true)
    setError(null)
    try {
      const startDate = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`
      const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate()
      const endDate = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${lastDay}`

      const { data, error: err } = await supabase
        .from('coverage_needs')
        .select('*')
        .eq('team_id', teamId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date')
      if (err) throw err
      setNeeds(data ?? [])
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, [teamId, viewYear, viewMonth])

  useEffect(() => { loadNeeds() }, [loadNeeds])

  async function openAssign(need: CoverageNeed) {
    setAssignModal(need)
    setAssignMode('internal')
    setInternalEmpId('')
    setTempWorkerId('')
    // Load temp workers for this team
    const { data } = await supabase
      .from('temp_workers')
      .select('*')
      .eq('team_id', teamId)
      .eq('active', true)
      .order('last_name')
    setTempWorkers(data ?? [])
  }

  // Employees not scheduled or on rest that day
  function availableInternals(need: CoverageNeed): Employee[] {
    return employees.filter(e => {
      // exclude absent employee
      if (e.id === need.absent_employee_id) return false
      return true
    })
  }

  async function handleAssign() {
    if (!assignModal) return
    setAssigning(true)
    try {
      const patch: Record<string, any> = { status: 'assigned' }
      if (assignMode === 'internal' && internalEmpId) {
        patch.assigned_to = internalEmpId
        patch.temp_worker_id = null
      } else if (assignMode === 'interim' && tempWorkerId) {
        patch.temp_worker_id = tempWorkerId
        patch.assigned_to = null
      }
      const { error: err } = await supabase
        .from('coverage_needs')
        .update(patch)
        .eq('id', assignModal.id)
      if (err) throw err
      setAssignModal(null)
      await loadNeeds()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setAssigning(false)
    }
  }

  async function handleClose(id: string) {
    await supabase.from('coverage_needs').update({ status: 'closed' }).eq('id', id)
    loadNeeds()
  }

  const absentName = (id: string | null) => {
    if (!id) return '—'
    const e = employees.find(x => x.id === id)
    return e ? `${e.last_name.toUpperCase()} ${e.first_name}` : '—'
  }

  const assignedName = (need: CoverageNeed) => {
    if (need.assigned_to) {
      const e = employees.find(x => x.id === need.assigned_to)
      return e ? `${e.last_name.toUpperCase()} ${e.first_name}` : need.assigned_to
    }
    if (need.temp_worker_id) {
      const tw = tempWorkers.find(t => t.id === need.temp_worker_id)
      return tw ? `${tw.last_name.toUpperCase()} ${tw.first_name} (intérim)` : need.temp_worker_id
    }
    return null
  }

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-gray-100 bg-gray-50 flex-wrap">
        <select value={viewMonth} onChange={e => setViewMonth(Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none">
          {MONTHS_FR.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select value={viewYear} onChange={e => setViewYear(Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none">
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <span className="text-xs text-gray-600">{needs.length} besoin{needs.length !== 1 ? 's' : ''}</span>
        <button onClick={loadNeeds} title="Rafraîchir"
          className="ml-auto p-1.5 border border-gray-200 rounded-lg hover:bg-white transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-3 bg-red-50 text-red-700 rounded-lg px-4 py-2.5 text-sm">Erreur : {error}</div>
      )}

      <div className="flex-1 overflow-auto px-4 py-3">
        {loading ? (
          <div className="space-y-2 animate-pulse">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-9 bg-gray-100 rounded-lg" />
            ))}
          </div>
        ) : needs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-emerald-700">Aucun besoin de couverture</p>
            <p className="text-xs text-gray-600 mt-1">pour {MONTHS_FR[viewMonth]} {viewYear}</p>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-700 w-28">Date</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-700">Salarié absent</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-700 w-28">Code prévu</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-700 w-36">Statut</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-700">Assigné à</th>
                  <th className="px-4 py-2.5 w-28" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {needs.map(need => (
                  <tr key={need.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-xs text-gray-700 font-mono whitespace-nowrap">{fmtDate(need.date)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-800 font-medium">{absentName(need.absent_employee_id)}</td>
                    <td className="px-4 py-2.5">
                      {need.shift_code && (
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-100">
                          {need.shift_code}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs">{STATUS_LABEL[need.status] ?? need.status}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{assignedName(need) ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      {need.status === 'open' && (
                        <button onClick={() => openAssign(need)}
                          className="px-3 py-1 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-colors">
                          Assigner
                        </button>
                      )}
                      {need.status === 'assigned' && (
                        <button onClick={() => handleClose(need.id)}
                          className="px-3 py-1 text-xs font-medium border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                          Fermer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modale assignation */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { if (!assigning) setAssignModal(null) }} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Assigner la couverture</h2>
            <p className="text-xs text-gray-600 mb-4">
              {fmtDate(assignModal.date)} · Absent : {absentName(assignModal.absent_employee_id)}
              {assignModal.shift_code && <> · Code : <strong>{assignModal.shift_code}</strong></>}
            </p>

            {/* Tabs internal / interim */}
            <div className="flex gap-0 border-b border-gray-200 mb-4">
              {(['internal', 'interim'] as const).map(m => (
                <button key={m} onClick={() => setAssignMode(m)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${assignMode === m ? 'border-slate-900 text-slate-900' : 'border-transparent text-gray-600 hover:text-gray-800'}`}>
                  {m === 'internal' ? 'Renfort interne' : 'Intérimaire'}
                </button>
              ))}
            </div>

            {assignMode === 'internal' && (
              <div className="space-y-4">
                <select value={internalEmpId} onChange={e => setInternalEmpId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
                  <option value="">— Sélectionner un salarié —</option>
                  {availableInternals(assignModal).map(e => (
                    <option key={e.id} value={e.id}>{e.last_name.toUpperCase()} {e.first_name}</option>
                  ))}
                </select>
              </div>
            )}

            {assignMode === 'interim' && (
              <div className="space-y-4">
                {tempWorkers.length === 0 ? (
                  <p className="text-sm text-gray-600 italic">Aucun intérimaire actif pour cette équipe. Ajoutez-en dans Paramétrage → Intérimaires.</p>
                ) : (
                  <select value={tempWorkerId} onChange={e => setTempWorkerId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
                    <option value="">— Sélectionner un intérimaire —</option>
                    {tempWorkers.map(tw => (
                      <option key={tw.id} value={tw.id}>{tw.last_name.toUpperCase()} {tw.first_name}{tw.agency ? ` (${tw.agency})` : ''}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setAssignModal(null)} disabled={assigning}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                Annuler
              </button>
              <button onClick={handleAssign}
                disabled={assigning || (assignMode === 'internal' ? !internalEmpId : !tempWorkerId)}
                className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50">
                {assigning ? 'Assignation…' : 'Assigner'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
