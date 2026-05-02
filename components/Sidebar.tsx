'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { usePermissions } from '@/lib/permissions'
import type { Permission } from '@/lib/permissions'
import { useSite } from '@/lib/site-context'
import { supabase } from '@/lib/supabase'

type NavItem = {
  href: string
  label: string
  adminOnly?: boolean
  requiredAnyPermission?: Permission[]
  icon: React.ReactNode
}

const navItems: NavItem[] = [
  {
    href: '/sites',
    label: 'Sites',
    adminOnly: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    href: '/tableau-de-bord',
    label: 'Tableau de bord',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
      </svg>
    ),
  },
  {
    href: '/equipes',
    label: 'Équipes',
    requiredAnyPermission: ['edit_teams'],
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    href: '/employes',
    label: 'Salariés',
    requiredAnyPermission: ['create_employee', 'delete_employee', 'import_employees'],
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    href: '/planning',
    label: 'Planning',
    requiredAnyPermission: ['edit_planning', 'print_planning', 'print_emargement', 'view_hours_counter', 'archive_planning', 'apply_cycle'],
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    href: '/cycle',
    label: 'Cycles',
    requiredAnyPermission: ['view_cycles', 'edit_cycles'],
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
  },
  {
    href: '/parametrage',
    label: 'Paramétrage',
    requiredAnyPermission: ['edit_shift_codes', 'edit_absence_codes', 'edit_staffing', 'edit_calendar', 'edit_functions'],
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    href: '/admin/utilisateurs',
    label: 'Utilisateurs',
    adminOnly: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
]

const STORAGE_KEY = 'musiam-sidebar-collapsed'

function PasswordModal({ onClose }: { onClose: () => void }) {
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (newPwd.length < 6) { setError('Le nouveau mot de passe doit faire au moins 6 caractères.'); return }
    if (newPwd !== confirmPwd) { setError('Les mots de passe ne correspondent pas.'); return }
    setSaving(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: (await supabase.auth.getUser()).data.user?.email ?? '',
        password: oldPwd,
      })
      if (signInError) { setError('Ancien mot de passe incorrect.'); return }
      const { error: updateError } = await supabase.auth.updateUser({ password: newPwd })
      if (updateError) throw updateError
      setSuccess(true)
    } catch (err: any) {
      setError(err?.message ?? 'Erreur lors du changement de mot de passe.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-bold text-gray-900 mb-4">Modifier mon mot de passe</h2>
        {success ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
              Mot de passe modifié avec succès.
            </div>
            <button onClick={onClose} className="w-full px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg">
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Ancien mot de passe</label>
              <input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)} required disabled={saving}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-50" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Nouveau mot de passe</label>
              <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} required disabled={saving}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-50" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Confirmer le nouveau mot de passe</label>
              <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} required disabled={saving}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-50" />
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={onClose} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                Annuler
              </button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-700 disabled:opacity-40 transition-colors">
                {saving ? 'Enregistrement…' : 'Modifier'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const { role, allowedTeams, loading: authLoading, signOut } = useAuth()
  const { can } = usePermissions()
  const { sites, selectedSiteId, setSelectedSiteId } = useSite()
  const [managerSiteIds, setManagerSiteIds] = useState<Set<string> | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'true') setCollapsed(true)
    setMounted(true)
  }, [])

  // Pour les managers : calculer les sites accessibles via leurs équipes autorisées
  useEffect(() => {
    if (role !== 'manager' || allowedTeams.length === 0) { setManagerSiteIds(null); return }
    supabase.from('teams').select('site_id').in('id', allowedTeams).then(({ data }: { data: { site_id: string | null }[] | null }) => {
      const ids = new Set<string>(
        (data ?? []).map(t => t.site_id).filter((id): id is string => !!id)
      )
      setManagerSiteIds(ids)
    })
  }, [role, allowedTeams])

  // Auto-corriger le site sélectionné si le manager n'y a pas accès
  useEffect(() => {
    if (!managerSiteIds || !selectedSiteId) return
    if (!managerSiteIds.has(selectedSiteId)) {
      const first = sites.find(s => managerSiteIds.has(s.id))
      if (first) setSelectedSiteId(first.id)
    }
  }, [managerSiteIds, sites, selectedSiteId])

  function toggle() {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }

  if (!mounted) return <aside className="w-60 shrink-0 bg-slate-900" />

  const visibleItems = navItems.filter(item => {
    if (item.adminOnly && role !== 'admin') return false
    if (role === 'admin') return true
    if (item.requiredAnyPermission && item.requiredAnyPermission.length > 0) {
      return item.requiredAnyPermission.some(p => can(p))
    }
    return true
  })

  const visibleSites = managerSiteIds ? sites.filter(s => managerSiteIds.has(s.id)) : sites
  const showSiteSelector = sites.length > 0

  return (
    <>
    {showPasswordModal && <PasswordModal onClose={() => setShowPasswordModal(false)} />}
    <aside
      className="shrink-0 bg-slate-900 text-white flex flex-col overflow-hidden"
      style={{ width: collapsed ? 56 : 240, transition: 'width 0.2s ease' }}
    >
      {/* Header */}
      <div
        className="flex items-center border-b border-slate-700/60"
        style={{ padding: collapsed ? '18px 0' : '18px 24px', justifyContent: collapsed ? 'center' : 'space-between', minHeight: 64 }}
      >
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="text-base font-bold tracking-tight whitespace-nowrap">Musiam Planning</div>
            <p className="text-slate-400 text-xs mt-0.5 whitespace-nowrap italic">by Planekipe ©</p>
          </div>
        )}
        <button
          onClick={toggle}
          title={collapsed ? 'Développer la sidebar' : 'Réduire la sidebar'}
          className="flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition-colors shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {collapsed
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />}
          </svg>
        </button>
      </div>

      {/* Site selector */}
      {showSiteSelector && (
        <div
          className="border-b border-slate-700/60"
          style={{ padding: collapsed ? '8px 6px' : '8px 12px' }}
        >
          {collapsed ? (
            <div
              className="flex items-center justify-center py-1 text-slate-300"
              title={sites.find(s => s.id === selectedSiteId)?.name ?? 'Site'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          ) : (
            <div>
              <p className="text-slate-500 text-xs mb-1.5 px-1">Site actif</p>
              <select
                value={selectedSiteId ?? ''}
                onChange={e => setSelectedSiteId(e.target.value || null)}
                className="w-full text-xs bg-slate-800 text-slate-100 border border-slate-600 rounded-md px-2 py-1.5 focus:outline-none focus:border-slate-400"
              >
                {role === 'admin' && <option value="">Tous les sites</option>}
                {visibleSites.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 py-3" style={{ padding: collapsed ? '12px 6px' : '12px 12px' }}>
        <ul className="space-y-0.5">
          {/* Mon planning — admins, responsables, managers */}
          {(role === 'admin' || role === 'responsable' || role === 'manager') && (
            <li>
              <Link
                href="/mon-planning"
                title={collapsed ? 'Mon planning' : undefined}
                className={`flex items-center rounded-lg text-sm font-medium transition-colors ${
                  collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
                } ${pathname.startsWith('/mon-planning') ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {!collapsed && <span className="whitespace-nowrap overflow-hidden">Mon planning</span>}
              </Link>
            </li>
          )}
          {visibleItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center rounded-lg text-sm font-medium transition-colors ${
                    collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
                  } ${active ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}
                >
                  {item.icon}
                  {!collapsed && <span className="whitespace-nowrap overflow-hidden">{item.label}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer : déconnexion + copyright */}
      <div className="border-t border-slate-700/60" style={{ padding: collapsed ? '10px 6px' : '10px 12px' }}>
        {!authLoading && (
          <>
            <button
              onClick={() => setShowPasswordModal(true)}
              title={collapsed ? 'Modifier mon mot de passe' : undefined}
              className={`w-full flex items-center rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors mb-0.5 ${
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              {!collapsed && <span className="whitespace-nowrap">Modifier mon mot de passe</span>}
            </button>
            <button
              onClick={signOut}
              title={collapsed ? 'Se déconnecter' : undefined}
              className={`w-full flex items-center rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors ${
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {!collapsed && <span className="whitespace-nowrap">Se déconnecter</span>}
            </button>
          </>
        )}
        {!collapsed && (
          <p className="text-slate-500 mt-2 px-3" style={{ fontSize: '10px', lineHeight: '1.4' }}>
            Planekipe v1.0 © Sebastien Gauthier
          </p>
        )}
      </div>
    </aside>
    </>
  )
}
