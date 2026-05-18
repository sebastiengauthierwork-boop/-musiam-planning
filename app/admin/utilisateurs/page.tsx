'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, Fragment } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { teamLabel } from '@/lib/teamUtils'
import { isAdmin, isSuperAdmin } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Team {
  id: string
  name: string
  cdpf: string | null
}

interface Site {
  id: string
  name: string
}

interface AppUser {
  id: string
  email: string
  login_code: string | null
  role: 'superadmin' | 'admin' | 'responsable' | 'manager' | 'salarie'
  team_id: string | null
  allowed_teams: string[] | null
  allowed_site_id: string | null
  employee_id: string | null
}

interface SimpleEmployee {
  id: string
  first_name: string
  last_name: string
}

type ModalMode = 'edit'

const EMPTY_FORM = {
  email: '',
  role: 'manager' as 'superadmin' | 'admin' | 'responsable' | 'manager' | 'salarie',
  allowedTeams: [] as string[],
  allowedSiteId: '',
  employeeId: '',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function RoleBadge({ role }: { role: 'superadmin' | 'admin' | 'responsable' | 'manager' | 'salarie' }) {
  if (role === 'superadmin') {
    return (
      <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">
        Superadmin
      </span>
    )
  }
  if (role === 'admin') {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
        Administrateur
      </span>
    )
  }
  if (role === 'responsable') {
    return (
      <span className="inline-flex items-center rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700">
        Responsable
      </span>
    )
  }
  if (role === 'salarie') {
    return (
      <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
        Salarié
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
      Manager
    </span>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function UtilisateursPage() {
  const { role: currentRole, loading: authLoading } = useAuth()

  const [users, setUsers] = useState<AppUser[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [employees, setEmployees] = useState<SimpleEmployee[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('edit')
  const [editingUser, setEditingUser] = useState<AppUser | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [pageSuccess, setPageSuccess] = useState<string | null>(null)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Export backup
  const [exporting, setExporting] = useState(false)

  // Reset mot de passe
  const [resetTarget, setResetTarget] = useState<AppUser | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [showResetPw, setShowResetPw] = useState(false)
  const [resetSaving, setResetSaving] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetSuccess, setResetSuccess] = useState(false)

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  async function loadData() {
    setDataLoading(true)
    setError(null)
    const [usersRes, teamsRes, sitesRes] = await Promise.all([
      supabase.from('users').select('id, email, login_code, role, team_id, allowed_teams, allowed_site_id, employee_id').order('email'),
      supabase.from('teams').select('id, name, cdpf').order('name'),
      supabase.from('sites').select('id, name').eq('is_active', true).order('name'),
    ])
    if (usersRes.error) {
      setError(usersRes.error.message)
    } else {
      setUsers(usersRes.data ?? [])
    }
    if (!teamsRes.error) setTeams(teamsRes.data ?? [])
    if (!sitesRes.error) setSites(sitesRes.data ?? [])
    setDataLoading(false)
  }

  useEffect(() => {
    if (!authLoading && currentRole === 'superadmin') {
      loadData()
    }
  }, [authLoading, currentRole])

  // -------------------------------------------------------------------------
  // Access guard
  // -------------------------------------------------------------------------

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-500 text-sm">Chargement…</p>
      </div>
    )
  }

  if (currentRole !== 'superadmin') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-800">Accès refusé</p>
          <p className="text-sm text-slate-500 mt-1">
            Vous n'avez pas les droits nécessaires pour accéder à cette page.
          </p>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Modal helpers
  // -------------------------------------------------------------------------

  async function loadEmployees() {
    const { data } = await supabase
      .from('employees')
      .select('id, first_name, last_name')
      .eq('is_active', true)
      .order('last_name')
    setEmployees(data ?? [])
  }

  function openEditModal(user: AppUser) {
    setModalMode('edit')
    setEditingUser(user)
    setForm({
      email: user.email,
      role: user.role,
      allowedTeams: user.allowed_teams ?? [],
      allowedSiteId: user.allowed_site_id ?? '',
      employeeId: user.employee_id ?? '',
    })
    setModalError(null)
    setModalOpen(true)
    loadEmployees()
  }

  function closeModal() {
    setModalOpen(false)
    setEditingUser(null)
    setModalError(null)
  }

  function toggleTeam(teamId: string) {
    setForm((prev) => ({
      ...prev,
      allowedTeams: prev.allowedTeams.includes(teamId)
        ? prev.allowedTeams.filter((id) => id !== teamId)
        : [...prev.allowedTeams, teamId],
    }))
  }

  // -------------------------------------------------------------------------
  // Save (add / edit)
  // -------------------------------------------------------------------------

  async function handleSave() {
    setModalError(null)
    setSaving(true)
    if (!editingUser) return

    const emailNorm = form.email.trim().toLowerCase()
    const emailChanged = emailNorm !== editingUser.email.toLowerCase()

    if (emailChanged && isAdmin(currentRole)) {
      const session = (await supabase.auth.getSession()).data.session
      const res = await fetch('/api/update-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ user_id: editingUser.id, new_email: emailNorm }),
      })
      const result = await res.json()
      if (!res.ok) {
        setModalError(result.error ?? "Erreur lors de la modification de l'email")
        setSaving(false)
        return
      }
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({
        role: form.role,
        allowed_teams: form.role === 'manager' ? form.allowedTeams : [],
        allowed_site_id: form.role === 'responsable' ? form.allowedSiteId || null : null,
        employee_id: form.employeeId || null,
      })
      .eq('id', editingUser.id)
    if (updateError) {
      setModalError(updateError.message)
      setSaving(false)
      return
    }
    await loadData()
    setSaving(false)
    closeModal()
    setPageSuccess(
      emailChanged && isAdmin(currentRole)
        ? `Email modifié. Le salarié doit maintenant se connecter avec ${emailNorm}`
        : 'Utilisateur mis à jour avec succès.'
    )
  }

  // -------------------------------------------------------------------------
  // Reset mot de passe
  // -------------------------------------------------------------------------

  async function handleResetPassword() {
    if (!resetTarget || !resetPassword) return
    setResetSaving(true)
    setResetError(null)
    try {
      const session = (await supabase.auth.getSession()).data.session
      const res = await fetch('/api/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ user_id: resetTarget.id, new_password: resetPassword }),
      })
      const result = await res.json()
      if (!res.ok) { setResetError(result.error ?? 'Erreur'); return }
      setResetSuccess(true)
    } catch (e: any) {
      setResetError(e?.message ?? 'Erreur réseau')
    } finally {
      setResetSaving(false)
    }
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', deleteTarget.id)
    if (deleteError) {
      setError(deleteError.message)
    } else {
      await loadData()
    }
    setDeleting(false)
    setDeleteTarget(null)
  }

  // -------------------------------------------------------------------------
  // Team name lookup
  // -------------------------------------------------------------------------

  function teamName(id: string): string {
    const t = teams.find((t) => t.id === id)
    return t ? teamLabel(t) : id.slice(0, 8)
  }

  // -------------------------------------------------------------------------
  // Export backup
  // -------------------------------------------------------------------------

  async function handleExportBackup() {
    setExporting(true)
    try {
      const tables = [
        'sites', 'teams', 'employees', 'employee_teams', 'shift_codes', 'absence_codes',
        'schedules', 'cycle_schedules', 'users', 'staffing_structures',
        'staffing_structure_positions', 'annual_calendar', 'planning_archives',
        'planning_status', 'job_functions', 'role_permissions', 'contacts_utiles',
        'employee_history',
      ]
      const results = await Promise.all(
        tables.map(t => supabase.from(t).select('*'))
      )
      const backup: Record<string, unknown[]> = {}
      results.forEach((res, i) => { backup[tables[i]] = res.data ?? [] })

      const date = new Date().toISOString().slice(0, 10)
      const json = JSON.stringify({ exported_at: new Date().toISOString(), tables: backup }, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `backup_planekipe_${date}.json`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Gestion des utilisateurs
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Modifiez les rôles et les accès. Pour créer un accès, utilisez le bouton "Créer accès" dans la page <strong>Salariés</strong>.
          </p>
        </div>
        {isSuperAdmin(currentRole) && <button
          onClick={handleExportBackup}
          disabled={exporting}
          className="shrink-0 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
          title="Télécharge toutes les tables en JSON"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {exporting ? 'Export…' : 'Sauvegarder les données'}
        </button>}
      </div>

      {/* Success */}
      {pageSuccess && (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-emerald-700 font-medium">{pageSuccess}</p>
          <button onClick={() => setPageSuccess(null)} className="text-emerald-500 hover:text-emerald-700 ml-4 text-lg leading-none">×</button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        {dataLoading ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-slate-500">Chargement…</p>
          </div>
        ) : users.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-slate-500">Aucun utilisateur trouvé.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Rôle
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Équipes autorisées
                </th>
                <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5 text-slate-800 font-medium">
                    {user.role === 'salarie' && user.login_code
                      ? <span className="font-mono text-violet-700">{user.login_code}</span>
                      : user.email}
                  </td>
                  <td className="px-5 py-3.5">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="px-5 py-3.5">
                    {isAdmin(user.role) ? (
                      <span className="text-slate-400 text-xs italic">
                        Toutes les équipes
                      </span>
                    ) : user.role === 'responsable' ? (
                      <span className="text-orange-700 text-xs font-medium">
                        {sites.find(s => s.id === user.allowed_site_id)?.name ?? 'Aucun site'} – Toutes les équipes
                      </span>
                    ) : user.role === 'salarie' ? (
                      <span className="text-slate-400 text-xs italic">
                        {user.employee_id ? 'Salarié lié' : 'Non lié'}
                      </span>
                    ) : user.allowed_teams && user.allowed_teams.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {user.allowed_teams.map((tid) => (
                          <span
                            key={tid}
                            className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700"
                          >
                            {teamName(tid)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs italic">
                        Aucune équipe
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setResetTarget(user); setResetPassword(''); setResetError(null); setResetSuccess(false); setShowResetPw(false) }}
                        className="rounded-md px-3 py-1.5 text-xs font-medium text-amber-700 border border-amber-200 hover:bg-amber-50 transition-colors"
                        title="Réinitialiser le mot de passe"
                      >
                        Mot de passe
                      </button>
                      <button
                        onClick={() => openEditModal(user)}
                        className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => setDeleteTarget(user)}
                        className="rounded-md px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Add / Edit Modal                                                    */}
      {/* ------------------------------------------------------------------ */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={closeModal}
          />
          {/* Panel */}
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-xl p-7">
            <h2 className="text-lg font-semibold text-slate-900 mb-5">
              Modifier l'utilisateur
            </h2>

            <div className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Adresse e-mail
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="prenom.nom@musiam.fr"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Rôle
                </label>
                <select
                  value={form.role}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      role: e.target.value as 'superadmin' | 'admin' | 'responsable' | 'manager' | 'salarie',
                      employeeId: '',
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition"
                >
                  {isSuperAdmin(currentRole) && <option value="superadmin">Superadministrateur</option>}
                  {isSuperAdmin(currentRole) && <option value="admin">Administrateur</option>}
                  <option value="responsable">Responsable de site</option>
                  <option value="manager">Manager</option>
                  <option value="salarie">Salarié</option>
                </select>
              </div>

              {/* Salarié associé — tous les rôles */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Salarié associé{form.role !== 'salarie' ? ' (optionnel)' : ''}
                </label>
                <select
                  value={form.employeeId}
                  onChange={(e) => setForm(prev => ({ ...prev, employeeId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition"
                >
                  <option value="">— Sélectionner un salarié —</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.last_name} {emp.first_name}
                    </option>
                  ))}
                </select>
                {form.role !== 'salarie' && (
                  <p className="text-xs text-slate-400 mt-1">
                    Permet d&apos;accéder à &laquo;&nbsp;Mon planning&nbsp;&raquo; avec le planning personnel.
                  </p>
                )}
              </div>

              {/* Site autorisé — responsable only */}
              {form.role === 'responsable' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Site
                  </label>
                  <select
                    value={form.allowedSiteId}
                    onChange={(e) => setForm({ ...form, allowedSiteId: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition"
                  >
                    <option value="">— Sélectionner un site —</option>
                    {sites.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">Le responsable accède à toutes les équipes de ce site.</p>
                </div>
              )}

              {/* Équipes autorisées — managers only */}
              {form.role === 'manager' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Équipes autorisées
                  </label>
                  {teams.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">
                      Aucune équipe disponible.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {teams.map((team) => (
                        <label
                          key={team.id}
                          className="flex items-center gap-3 cursor-pointer group"
                        >
                          <input
                            type="checkbox"
                            checked={form.allowedTeams.includes(team.id)}
                            onChange={() => toggleTeam(team.id)}
                            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                          />
                          <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">
                            {teamLabel(team)}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Modal error */}
              {modalError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3">
                  <p className="text-sm text-red-700">{modalError}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={closeModal}
                disabled={saving}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Reset mot de passe modal                                            */}
      {/* ------------------------------------------------------------------ */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setResetTarget(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white shadow-xl p-7">
            <h2 className="text-lg font-semibold text-slate-900 mb-5">Réinitialiser le mot de passe</h2>
            {resetSuccess ? (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
                  <p className="font-medium">Mot de passe mis à jour.</p>
                  {resetTarget.login_code && (
                    <p className="mt-1">Identifiant : <span className="font-mono font-bold text-violet-700">{resetTarget.login_code}</span></p>
                  )}
                </div>
                <div className="flex justify-end">
                  <button onClick={() => setResetTarget(null)} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white">Fermer</button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Utilisateur</p>
                  <p className="font-medium text-slate-900">
                    {resetTarget.role === 'salarie' && resetTarget.login_code
                      ? <span className="font-mono text-violet-700">{resetTarget.login_code}</span>
                      : resetTarget.email}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Nouveau mot de passe</label>
                  <div className="relative">
                    <input
                      type={showResetPw ? 'text' : 'password'}
                      value={resetPassword}
                      onChange={e => setResetPassword(e.target.value)}
                      placeholder="Min. 6 caractères"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 pr-10 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition"
                    />
                    <button type="button" onClick={() => setShowResetPw(p => !p)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showResetPw ? "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" : "M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"} />
                      </svg>
                    </button>
                  </div>
                </div>
                {resetError && <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">{resetError}</div>}
                <div className="flex items-center justify-end gap-3 mt-2">
                  <button onClick={() => setResetTarget(null)} disabled={resetSaving} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    Annuler
                  </button>
                  <button onClick={handleResetPassword} disabled={resetSaving || resetPassword.length < 6} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                    {resetSaving ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Delete confirmation modal                                           */}
      {/* ------------------------------------------------------------------ */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setDeleteTarget(null)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white shadow-xl p-7">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              Supprimer l'utilisateur
            </h2>
            <p className="text-sm text-slate-600 mb-2">
              Êtes-vous sûr de vouloir supprimer{' '}
              <span className="font-medium text-slate-900">
                {deleteTarget.email}
              </span>{' '}
              ?
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-5">
              Attention : cette action supprime uniquement le profil dans la
              table <code className="font-mono">users</code>. Le compte
              Supabase Auth reste actif et doit être supprimé séparément via le
              Dashboard.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
