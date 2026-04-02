'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Role = 'admin' | 'manager' | null

interface AuthContextValue {
  user: User | null
  role: Role
  allowedTeams: string[]
  loading: boolean
  signOut: () => void
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  role: null,
  allowedTeams: [],
  loading: true,
  signOut: () => {},
})

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<Role>(null)
  const [allowedTeams, setAllowedTeams] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchUserProfile(authUser: User) {
    const { data, error } = await supabase
      .from('users')
      .select('role, allowed_teams')
      .eq('id', authUser.id)
      .single()

    if (!error && data) {
      setRole((data.role as Role) ?? null)
      setAllowedTeams(data.allowed_teams ?? [])
    } else {
      setRole(null)
      setAllowedTeams([])
    }
  }

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        await fetchUserProfile(session.user)
      } else {
        setUser(null)
        setRole(null)
        setAllowedTeams([])
      }
      setLoading(false)
    })

    // Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUser(session.user)
        await fetchUserProfile(session.user)
      } else {
        setUser(null)
        setRole(null)
        setAllowedTeams([])
      }
      setLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  function signOut() {
    supabase.auth.signOut().then(() => {
      window.location.href = '/login'
    })
  }

  return (
    <AuthContext.Provider value={{ user, role, allowedTeams, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
