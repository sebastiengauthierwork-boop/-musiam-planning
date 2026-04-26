'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

export type Site = {
  id: string
  name: string
  cdpf_prefix: string | null
  address: string | null
  is_active: boolean
}

interface SiteContextValue {
  sites: Site[]
  selectedSiteId: string | null   // null = tous les sites (admin seulement)
  setSelectedSiteId: (id: string | null) => void
  selectedSite: Site | null
}

const SiteContext = createContext<SiteContextValue>({
  sites: [], selectedSiteId: null, setSelectedSiteId: () => {}, selectedSite: null,
})

const STORAGE_KEY = 'musiam-selected-site'

export function SiteProvider({ children }: { children: ReactNode }) {
  const { role, allowedSiteId: userSiteId } = useAuth()
  const [allSites, setAllSites] = useState<Site[]>([])
  const [selectedSiteId, _set] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('sites')
      .select('id, name, cdpf_prefix, address, is_active')
      .eq('is_active', true)
      .order('name')
      .then(({ data, error }: { data: any; error: any }) => {
        if (error || !data) return
        setAllSites(data)
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored && stored !== 'null' && data.some((s: any) => s.id === stored)) {
          _set(stored)
        } else {
          const first = data[0]?.id ?? null
          _set(first)
          if (first) localStorage.setItem(STORAGE_KEY, first)
        }
      })
  }, [])

  // Quand un responsable se connecte, forcer son site
  useEffect(() => {
    if (role === 'responsable' && userSiteId) {
      _set(userSiteId)
      localStorage.setItem(STORAGE_KEY, userSiteId)
    }
  }, [role, userSiteId])

  function setSelectedSiteId(id: string | null) {
    if (role === 'responsable') return  // un responsable ne peut pas changer de site
    _set(id)
    localStorage.setItem(STORAGE_KEY, id ?? 'null')
  }

  // Un responsable ne voit que son propre site dans le sélecteur
  const sites = useMemo(() => {
    if (role === 'responsable' && userSiteId) {
      return allSites.filter(s => s.id === userSiteId)
    }
    return allSites
  }, [allSites, role, userSiteId])

  const selectedSite = sites.find(s => s.id === selectedSiteId) ?? null

  return (
    <SiteContext.Provider value={{ sites, selectedSiteId, setSelectedSiteId, selectedSite }}>
      {children}
    </SiteContext.Provider>
  )
}

export function useSite(): SiteContextValue {
  return useContext(SiteContext)
}
