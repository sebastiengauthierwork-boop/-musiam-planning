'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Role = 'admin' | 'manager' | null

interface AuthContextValue {
  user: User | null
  role: Role
  allowedTeams: string[]
  loading: boolean
  signOut: () => void
}

export const AuthContext = createContext<AuthContextValue>({
  user: null, role: null, allowedTeams: [], loading: true, signOut: () => {},
})

const RESTRICTED_ROUTES = ['/parametrage', '/admin']

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<Role>(null)
  const [allowedTeams, setAllowedTeams] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchUserProfile(authUser: User): Promise<Role> {
    const { data, error } = await supabase
      .from('users').select('role, allowed_teams').eq('id', authUser.id).single()
    if (!error && data) {
      setRole((data.role as Role) ?? null)
      setAllowedTeams(data.allowed_teams ?? [])
      return (data.role as Role) ?? null
    }
    setRole(null); setAllowedTeams([])
    return null
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }: { data: { session: any } }) => {
      if (session?.user) {
        setUser(session.user)
        const userRole = await fetchUserProfile(session.user)
        redirectIfNeeded(session.user, userRole)
      } else {
        setUser(null); setRole(null); setAllowedTeams([])
        redirectIfNeeded(null, null)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event: any, session: any) => {
      if (session?.user) {
        setUser(session.user)
        const userRole = await fetchUserProfile(session.user)
        redirectIfNeeded(session.user, userRole)
      } else {
        setUser(null); setRole(null); setAllowedTeams([])
        redirectIfNeeded(null, null)
      }
      setLoading(false)
    })

    return () => { subscription.unsubscribe() }
  }, [])

  function signOut() {
    supabase.auth.signOut().then(() => { window.location.href = '/login' })
  }

  return (
    <AuthContext.Provider value={{ user, role, allowedTeams, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

function redirectIfNeeded(user: User | null, role: Role) {
  if (typeof window === 'undefined') return
  const pathname = window.location.pathname

  // Non connecté hors /login → /login
  if (!user && !pathname.startsWith('/login')) {
    window.location.href = '/login'
    return
  }

  // Connecté sur /login → /planning
  if (user && pathname.startsWith('/login')) {
    window.location.href = '/planning'
    return
  }

  // Manager sur route restreinte → /planning
  if (user && role === 'manager') {
    const isRestricted = RESTRICTED_ROUTES.some(r => pathname.startsWith(r))
    if (isRestricted) {
      window.location.href = '/planning'
    }
  }
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
