'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Role = 'admin' | 'responsable' | 'manager' | 'salarie' | null

interface AuthContextValue {
  user: User | null
  role: Role
  allowedTeams: string[]
  allowedSiteId: string | null
  loading: boolean
  signOut: () => void
}

export const AuthContext = createContext<AuthContextValue>({
  user: null, role: null, allowedTeams: [], allowedSiteId: null, loading: true, signOut: () => {},
})

const RESTRICTED_ROUTES = ['/parametrage', '/admin']

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<Role>(null)
  const [allowedTeams, setAllowedTeams] = useState<string[]>([])
  const [allowedSiteId, setAllowedSiteId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchUserProfile(authUser: User): Promise<Role> {
    const { data, error } = await supabase
      .from('users').select('role, allowed_teams, allowed_site_id').eq('id', authUser.id).single()
    if (!error && data) {
      setRole((data.role as Role) ?? null)
      setAllowedTeams(data.allowed_teams ?? [])
      setAllowedSiteId(data.allowed_site_id ?? null)
      return (data.role as Role) ?? null
    }
    setRole(null); setAllowedTeams([]); setAllowedSiteId(null)
    return null
  }

  useEffect(() => {
    let timedOut = false

    // Timeout 3s : si getSession() ne répond pas, on considère l'utilisateur
    // non connecté et on redirige vers /login pour ne pas bloquer indéfiniment.
    const timeout = setTimeout(() => {
      timedOut = true
      setUser(null); setRole(null); setAllowedTeams([]); setAllowedSiteId(null)
      const redirected = redirectIfNeeded(null, null)
      if (!redirected) setLoading(false)
    }, 3000)

    supabase.auth.getSession().then(async ({ data: { session } }: { data: { session: any } }) => {
      if (timedOut) return
      clearTimeout(timeout)

      if (session?.user) {
        setUser(session.user)
        // Attendre le rôle avant de libérer le rendu — évite le flash dashboard/sidebar
        fetchUserProfile(session.user).then(userRole => {
          if (handleJustLoggedIn(userRole)) return
          const redirected = redirectIfNeeded(session.user, userRole)
          if (!redirected) setLoading(false)
        })
      } else {
        setUser(null); setRole(null); setAllowedTeams([]); setAllowedSiteId(null)
        const redirected = redirectIfNeeded(null, null)
        if (!redirected) setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event: any, session: any) => {
      if (session?.user) {
        setUser(session.user)
        fetchUserProfile(session.user).then(userRole => {
          if (handleJustLoggedIn(userRole)) return
          const redirected = redirectIfNeeded(session.user, userRole)
          if (!redirected) setLoading(false)
        })
      } else {
        setUser(null); setRole(null); setAllowedTeams([]); setAllowedSiteId(null)
        const redirected = redirectIfNeeded(null, null)
        if (!redirected) setLoading(false)
      }
    })

    return () => { clearTimeout(timeout); subscription.unsubscribe() }
  }, [])

  function signOut() {
    supabase.auth.signOut().then(() => {
      try { localStorage.clear() } catch {}
      try { sessionStorage.clear() } catch {}
      window.location.href = '/login'
    })
  }

  // Children toujours rendus — chaque page gère son propre état de chargement
  return (
    <AuthContext.Provider value={{ user, role, allowedTeams, allowedSiteId, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

function handleJustLoggedIn(role: Role): boolean {
  if (typeof window === 'undefined') return false
  const flag = sessionStorage.getItem('just_logged_in')
  if (!flag) return false
  sessionStorage.removeItem('just_logged_in')
  if (role === 'salarie') {
    window.location.href = '/mon-planning'
  } else {
    // Par défaut smartphone si matchMedia échoue (plus sûr)
    const isMobile = (() => {
      try { return window.matchMedia('(max-width: 767px)').matches } catch { return true }
    })()
    window.location.href = isMobile ? '/choix' : '/tableau-de-bord'
  }
  return true
}

function redirectIfNeeded(user: User | null, role: Role): boolean {
  if (typeof window === 'undefined') return false
  const pathname = window.location.pathname

  // Non connecté hors /login → /login
  if (!user && !pathname.startsWith('/login')) {
    window.location.href = '/login'
    return true
  }

  if (user) {
    // Connecté sur /login → redirect selon rôle et taille d'écran
    if (pathname.startsWith('/login')) {
      if (role === 'salarie') {
        window.location.href = '/mon-planning'
      } else {
        // admin/responsable/manager : choix sur mobile, tableau-de-bord sur PC
        window.location.href = window.matchMedia('(max-width: 767px)').matches ? '/choix' : '/tableau-de-bord'
      }
      return true
    }

    // Salarié → uniquement /mon-planning
    if (role === 'salarie' && !pathname.startsWith('/mon-planning')) {
      window.location.href = '/mon-planning'
      return true
    }

    // Responsable → bloqué uniquement sur /admin
    if (role === 'responsable' && pathname.startsWith('/admin')) {
      window.location.href = '/planning'
      return true
    }

    // Manager sur route restreinte → /planning
    if (role === 'manager') {
      const isRestricted = RESTRICTED_ROUTES.some(r => pathname.startsWith(r))
      if (isRestricted) {
        window.location.href = '/planning'
        return true
      }
    }
  }
  return false
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
