'use client'

import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'

const NO_SHELL_PATHS = ['/login', '/mon-planning']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (NO_SHELL_PATHS.includes(pathname)) {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      {/* key={pathname} forces a full remount of the page subtree on every
          navigation, so every useEffect([]) re-runs and fetches fresh data. */}
      <main key={pathname} className="flex-1 overflow-y-auto bg-gray-50">
        {children}
      </main>
    </div>
  )
}
