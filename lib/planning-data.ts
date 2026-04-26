import { supabase } from '@/lib/supabase'
import { sortEmployees } from '@/lib/employeeUtils'
import type { Employee, Schedule } from '@/app/planning/types'

export type TeamPlanningData = { employees: Employee[]; schedules: Schedule[] }

export async function loadTeamData(teamId: string, month: number, year: number): Promise<TeamPlanningData> {
  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const [etRes, schedRes] = await Promise.all([
    supabase
      .from('employee_teams')
      .select('employee_id, is_primary, employees(id, first_name, last_name, contract_type, weekly_contract_hours, hourly_rate, statut, fonction, is_active, start_date, end_date)')
      .eq('team_id', teamId),
    supabase
      .from('schedules')
      .select('id, employee_id, team_id, date, code, start_time, end_time, break_minutes, type, status, notes')
      .eq('team_id', teamId)
      .gte('date', startDate)
      .lte('date', endDate)
      .limit(5000),
  ])

  if (etRes.error) throw new Error(etRes.error.message)
  if (schedRes.error) throw new Error(schedRes.error.message)

  const empList: Employee[] = []
  const seen = new Set<string>()
  for (const et of (etRes.data ?? []) as any[]) {
    const e = et.employees
    if (!e || !e.is_active || seen.has(e.id)) continue
    seen.add(e.id)
    empList.push({
      id: e.id,
      first_name: e.first_name,
      last_name: e.last_name,
      contract_type: e.contract_type,
      weekly_contract_hours: e.weekly_contract_hours,
      hourly_rate: e.hourly_rate ?? null,
      statut: e.statut ?? null,
      fonction: e.fonction ?? null,
      is_primary: et.is_primary ?? true,
      start_date: e.start_date ?? null,
      end_date: e.end_date ?? null,
    })
  }

  const filtered = empList.filter(e => {
    if (e.start_date && e.start_date > endDate) return false
    if (e.end_date && e.end_date < startDate) return false
    return true
  })

  const { permanents, temporaires } = sortEmployees(filtered)
  return {
    employees: [...permanents, ...temporaires],
    schedules: schedRes.data ?? [],
  }
}
