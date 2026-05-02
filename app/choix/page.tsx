'use client'

export const dynamic = 'force-dynamic'

import { useEffect } from 'react'
import { useAuth } from '@/lib/auth'

export default function ChoixPage() {
  const { role, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    if (!role) { window.location.href = '/login'; return }
    if (role === 'salarie') { window.location.href = '/mon-planning'; return }
  }, [role, loading])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-gray-400 text-sm">Chargement…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-12">
          <div className="text-2xl font-bold text-slate-900">Musiam Planning</div>
          <p className="text-sm text-gray-500 mt-2">Que souhaitez-vous faire ?</p>
        </div>

        {/* Côte à côte sur PC, empilés sur mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <a
            href="/mon-planning"
            className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-700 transition-colors group"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-300 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <div className="text-center">
              <div className="text-lg font-bold">Mon planning</div>
              <div className="text-sm text-slate-400 mt-0.5">Voir mon planning personnel</div>
            </div>
          </a>

          <a
            href="/tableau-de-bord"
            className="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-slate-900 text-slate-900 hover:bg-slate-50 active:bg-slate-100 transition-colors group"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-400 group-hover:text-slate-700 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
            <div className="text-center">
              <div className="text-lg font-bold">Gestion des plannings</div>
              <div className="text-sm text-slate-500 mt-0.5">Accéder à l&apos;interface de gestion</div>
            </div>
          </a>
        </div>
      </div>
    </div>
  )
}
