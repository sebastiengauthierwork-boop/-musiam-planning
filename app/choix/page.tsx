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
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      window.location.href = '/tableau-de-bord'
    }
  }, [role, loading])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-gray-400 text-sm">Chargement…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="text-2xl font-bold text-slate-900">Musiam Planning</div>
          <p className="text-sm text-gray-500 mt-1.5">Que souhaitez-vous faire ?</p>
        </div>
        <div className="space-y-3">
          <a
            href="/mon-planning"
            className="block w-full text-center py-4 px-6 rounded-2xl bg-slate-900 text-white text-base font-semibold active:bg-slate-700 transition-colors"
          >
            Mon planning
          </a>
          <a
            href="/tableau-de-bord"
            className="block w-full text-center py-4 px-6 rounded-2xl border-2 border-slate-900 text-slate-900 text-base font-semibold active:bg-slate-100 transition-colors"
          >
            Gestion
          </a>
        </div>
      </div>
    </div>
  )
}
