'use client'

import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import Sidebar from './Sidebar'
import { useInactivityTimeout } from '@/hooks/useInactivityTimeout'

type Role = 'admin' | 'responsable' | 'manager' | 'salarie'

function InactivityGuard({ role }: { role: Role }) {
  const timeoutSeconds = role === 'salarie' ? 900 : 1800
  const showWarning = useInactivityTimeout(timeoutSeconds)

  if (!showWarning) return null

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: '#f59e0b', color: '#1c1917',
      padding: '10px 20px', textAlign: 'center',
      fontSize: '14px', fontWeight: 500, boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    }}>
      Vous serez déconnecté dans 2 minutes pour inactivité. Cliquez n'importe où pour rester connecté.
    </div>
  )
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { loading, role } = useAuth()

  // Page login : pas de guard, pas de sidebar
  if (pathname === '/login') {
    return <>{children}</>
  }

  // /mon-planning : guard actif (salarié), pas de sidebar
  if (pathname === '/mon-planning') {
    return (
      <>
        {role && <InactivityGuard role={role as Role} />}
        {children}
      </>
    )
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <p className="text-sm text-gray-400">Chargement…</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {role && <InactivityGuard role={role as Role} />}
      <Sidebar />
      {/* key={pathname} forces a full remount of the page subtree on every
          navigation, so every useEffect([]) re-runs and fetches fresh data. */}
      <main key={pathname} className="flex-1 overflow-y-auto bg-gray-50">
        {children}
      </main>
    </div>
  )
}
