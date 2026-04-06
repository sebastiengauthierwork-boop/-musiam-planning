export type Employee = {
  id: string
  first_name: string
  last_name: string
  contract_type: string
  weekly_contract_hours: number | null
  hourly_rate?: number | null
  statut?: string | null
  fonction?: string | null
  is_primary?: boolean   // true = équipe principale, false = renfort
}

export type CalendarDay = {
  date: string            // YYYY-MM-DD
  structure_id: string | null
  structure_name: string | null
}

export type ShiftCode = {
  id: string
  code: string
  label: string
  team_id: string | null     // FK vers teams — null = code commun toutes équipes
  team_prefix: string | null
  location_prefix: string | null
  start_time: string | null  // "HH:MM:SS"
  end_time: string | null
  break_minutes: number
  net_hours: number | null
  paid_hours: number | null
}

export type AbsenceCode = {
  id: string
  code: string
  label: string
  is_paid: boolean
}

export type Schedule = {
  id: string
  employee_id: string
  team_id: string
  date: string   // "YYYY-MM-DD"
  code: string | null
  start_time: string | null
  end_time: string | null
  break_minutes: number
  type: string
  status: string
  notes: string | null
}

export type Team = { id: string; name: string; cdpf: string | null; type: string }

export type TabProps = {
  employees: Employee[]
  schedules: Schedule[]
  shiftCodes: ShiftCode[]
  absenceCodes: AbsenceCode[]
  year: number
  month: number   // 0-indexed
  teamId: string
  teamName: string
  teams?: Team[]
  calendarDays?: CalendarDay[]
  isArchived?: boolean        // true = planning verrouillé
  archiveDate?: string | null // date d'archivage ISO
  onArchived?: () => void     // callback après archivage réussi
}
