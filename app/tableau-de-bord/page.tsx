'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { teamLabel } from '@/lib/teamUtils'
import { useSite } from '@/lib/site-context'

type Stats = {
  teamCount: number
  employeeCount: number
  todayShiftCount: number
}

type TeamSummary = {
  id: string
  name: string
  cdpf: string | null
  type: 'point_de_vente' | 'metier'
  employeeCount: number
}

export default function TableauDeBord() {
  const { selectedSiteId } = useSite()
  const [stats, setStats] = useState<Stats>({ teamCount: 0, employeeCount: 0, todayShiftCount: 0 })
  const [teams, setTeams] = useState<TeamSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const today = new Date().toISOString().split('T')[0]

        let teamsQ = supabase.from('teams').select('id, name, cdpf, type').order('name')
        if (selectedSiteId) teamsQ = teamsQ.eq('site_id', selectedSiteId)

        let empQ = supabase.from('employees').select('id', { count: 'exact' }).eq('is_active', true)
        if (selectedSiteId) empQ = empQ.eq('site_id', selectedSiteId)

        const [teamsRes, employeesRes, shiftsRes, etRes] = await Promise.all([
          teamsQ,
          empQ,
          supabase.from('schedules').select('id', { count: 'exact' }).eq('date', today).eq('type', 'shift'),
          supabase.from('employee_teams').select('team_id').limit(2000),
        ])

        if (teamsRes.error) throw new Error(teamsRes.error.message)
        if (employeesRes.error) throw new Error(employeesRes.error.message)

        const countByTeam: Record<string, number> = {}
        for (const et of etRes.data ?? []) {
          countByTeam[et.team_id] = (countByTeam[et.team_id] ?? 0) + 1
        }

        const teamSummaries: TeamSummary[] = (teamsRes.data ?? []).map((t: any) => ({
          ...t,
          employeeCount: countByTeam[t.id] ?? 0,
        }))

        setStats({
          teamCount: teamsRes.data?.length ?? 0,
          employeeCount: employeesRes.count ?? 0,
          todayShiftCount: shiftsRes.count ?? 0,
        })
        setTeams(teamSummaries)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [selectedSiteId])

  if (loading) return <LoadingScreen />
  if (error) return <ErrorScreen message={error} />

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="text-gray-500 text-sm mt-1">
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-5 mb-10">
        <StatCard
          label="Équipes"
          value={stats.teamCount}
          color="blue"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        />
        <StatCard
          label="Salariés actifs"
          value={stats.employeeCount}
          color="emerald"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          }
        />
        <StatCard
          label="Shifts aujourd'hui"
          value={stats.todayShiftCount}
          color="violet"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        />
      </div>

      {/* Teams summary */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Résumé des équipes</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Équipe</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Salariés</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {teams.map((team) => (
                <tr key={team.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-gray-900">{teamLabel(team)}</td>
                  <td className="px-5 py-3.5">
                    <TypeBadge type={team.type} />
                  </td>
                  <td className="px-5 py-3.5 text-right text-gray-600">{team.employeeCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    violet: 'bg-violet-50 text-violet-600',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500 font-medium">{label}</span>
        <div className={`p-2 rounded-lg ${colors[color]}`}>{icon}</div>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  return type === 'point_de_vente' ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
      Point de vente
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700">
      Métier
    </span>
  )
}

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-gray-400 text-sm">Chargement…</div>
    </div>
  )
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="p-8">
      <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm">Erreur : {message}</div>
    </div>
  )
}
