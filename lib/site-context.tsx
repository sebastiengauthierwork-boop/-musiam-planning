'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from './supabase'

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
  const [sites, setSites] = useState<Site[]>([])
  const [selectedSiteId, _set] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('sites')
      .select('id, name, cdpf_prefix, address, is_active')
      .eq('is_active', true)
      .order('name')
      .then(({ data, error }: { data: any; error: any }) => {
        if (error || !data) return   // table inexistante → pas de filtre site
        setSites(data)
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

  function setSelectedSiteId(id: string | null) {
    _set(id)
    localStorage.setItem(STORAGE_KEY, id ?? 'null')
  }

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
