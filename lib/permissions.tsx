'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

export type Permission =
  | 'create_site' | 'edit_teams'
  | 'create_employee' | 'delete_employee' | 'import_employees'
  | 'edit_shift_codes' | 'edit_absence_codes'
  | 'edit_planning' | 'apply_cycle' | 'print_planning' | 'print_emargement'
  | 'view_hours_counter' | 'archive_planning' | 'unarchive_planning'
  | 'edit_cycles' | 'view_cycles'
  | 'edit_staffing' | 'edit_calendar' | 'edit_functions'
  | 'create_responsable' | 'create_manager' | 'create_salarie'
  | 'view_own_planning' | 'view_team_planning'

interface PermissionsContextValue {
  can: (permission: Permission) => boolean
  loading: boolean
}

const PermissionsContext = createContext<PermissionsContextValue>({
  can: () => false,
  loading: true,
})

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { role, loading: authLoading } = useAuth()
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!role || role === 'admin') {
      setPermissions({})
      setLoading(false)
      return
    }
    supabase
      .from('role_permissions')
      .select('permission, allowed')
      .eq('role', role)
      .then(({ data }) => {
        const map: Record<string, boolean> = {}
        for (const row of (data ?? [])) {
          map[row.permission] = row.allowed
        }
        setPermissions(map)
        setLoading(false)
      })
  }, [role, authLoading])

  function can(permission: Permission): boolean {
    if (role === 'admin') return true
    if (loading) return true
    return permissions[permission] === true
  }

  return (
    <PermissionsContext.Provider value={{ can, loading }}>
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions(): PermissionsContextValue {
  return useContext(PermissionsContext)
}
