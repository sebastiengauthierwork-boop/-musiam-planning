'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ImportExcel from '@/components/ImportExcel'
import { teamLabel } from '@/lib/teamUtils'

type Employee = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  matricule: string | null
  contract_type: 'CDI' | 'CDD' | 'extra'
  weekly_contract_hours: number | null
  work_days_per_week: number | null
  daily_hours: number | null
  statut: 'cadre' | 'agent_de_maitrise' | 'employe' | null
  fonction: string | null
  is_active: boolean
  created_at: string
}

type Team = { id: string; name: string; cdpf: string | null }
type JobFunction = { id: string; name: string; is_active: boolean }

type EmployeeWithTeams = Employee & {
  teams: { team_id: string; name: string; cdpf: string | null; is_primary: boolean }[]
}

type FormData = {
  first_name: string
  last_name: string
  email: string
  phone: string
  matricule: string
  contract_type: 'CDI' | 'CDD' | 'extra'
  weekly_contract_hours: string
  work_days_per_week: string
  daily_hours: string
  statut: 'cadre' | 'agent_de_maitrise' | 'employe' | ''
  fonction: string
  selectedTeamIds: string[]
}

const emptyForm: FormData = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  matricule: '',
  contract_type: 'CDI',
  weekly_contract_hours: '',
  work_days_per_week: '5',
  daily_hours: '',
  statut: '',
  fonction: '',
  selectedTeamIds: [],
}

export default function EmployesPage() {
  const [employees, setEmployees] = useState<EmployeeWithTeams[]>([])
  const [allTeams, setAllTeams] = useState<Team[]>([])
  const [jobFunctions, setJobFunctions] = useState<JobFunction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [formData, setFormData] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  async function loadData() {
    const [empRes, etRes, teamsRes, fnRes] = await Promise.all([
      supabase.from('employees')
        .select('id, first_name, last_name, email, phone, matricule, contract_type, weekly_contract_hours, work_days_per_week, daily_hours, statut, fonction, is_active, created_at')
        .order('last_name').limit(500),
      supabase.from('employee_teams')
        .select('employee_id, team_id, is_primary, teams(name, cdpf)')
        .limit(2000),
      supabase.from('teams').select('id, name, cdpf').order('name').limit(100),
      supabase.from('job_functions').select('id, name, is_active').eq('is_active', true).order('name').limit(100),
    ])

    if (empRes.error) { setError(empRes.error.message); return }

    const teamsByEmployee: Record<string, { team_id: string; name: string; cdpf: string | null; is_primary: boolean }[]> = {}
    for (const et of (etRes.data ?? []) as any[]) {
      if (!teamsByEmployee[et.employee_id]) teamsByEmployee[et.employee_id] = []
      teamsByEmployee[et.employee_id].push({
        team_id: et.team_id,
        name: et.teams?.name ?? '',
        cdpf: et.teams?.cdpf ?? null,
        is_primary: et.is_primary,
      })
    }

    setEmployees((empRes.data ?? []).map((emp: any) => ({ ...emp, teams: teamsByEmployee[emp.id] ?? [] })))
    setAllTeams(teamsRes.data ?? [])
    setJobFunctions(fnRes.data ?? [])
  }

  useEffect(() => { loadData().finally(() => setLoading(false)) }, [])

  function openAdd() {
    setEditingEmployee(null); setFormData(emptyForm); setSaveError(null); setShowModal(true)
  }

  function openEdit(emp: EmployeeWithTeams) {
    setEditingEmployee(emp)
    setSaveError(null)
    setFormData({
      first_name: emp.first_name,
      last_name: emp.last_name,
      email: emp.email,
      phone: emp.phone ?? '',
      matricule: emp.matricule ?? '',
      contract_type: emp.contract_type,
      weekly_contract_hours: emp.weekly_contract_hours != null ? String(emp.weekly_contract_hours) : '',
      work_days_per_week: emp.work_days_per_week != null ? String(emp.work_days_per_week) : '5',
      daily_hours: emp.daily_hours != null ? String(emp.daily_hours) : '',
      statut: emp.statut ?? '',
      fonction: emp.fonction ?? '',
      selectedTeamIds: emp.teams.map((t) => t.team_id),
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!formData.first_name.trim() || !formData.last_name.trim() || !formData.email.trim()) return
    setSaving(true); setSaveError(null)
    try {
      const payload = {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || null,
        matricule: formData.matricule.trim() || null,
        contract_type: formData.contract_type,
        weekly_contract_hours: formData.contract_type !== 'extra' && formData.weekly_contract_hours
          ? parseFloat(formData.weekly_contract_hours) : null,
        work_days_per_week: formData.work_days_per_week ? parseInt(formData.work_days_per_week) : null,
        daily_hours: formData.daily_hours ? parseFloat(formData.daily_hours) : null,
        statut: formData.statut || null,
        fonction: formData.fonction.trim() || null,
      }

      let employeeId: string
      if (editingEmployee) {
        const { error } = await supabase.from('employees').update(payload).eq('id', editingEmployee.id)
        if (error) throw error
        employeeId = editingEmployee.id
        const { error: delErr } = await supabase.from('employee_teams').delete().eq('employee_id', employeeId)
        if (delErr) throw delErr
      } else {
        const { data, error } = await supabase.from('employees').insert(payload).select('id').single()
        if (error) throw error
        employeeId = data.id
      }

      if (formData.selectedTeamIds.length > 0) {
        const { error: insertErr } = await supabase.from('employee_teams').insert(
          formData.selectedTeamIds.map((teamId, index) => ({
            employee_id: employeeId,
            team_id: teamId,
            is_primary: index === 0,
          }))
        )
        if (insertErr) throw insertErr
      }

      setShowModal(false)
      await loadData()
    } catch (err: any) {
      setSaveError(err?.message ?? err?.details ?? JSON.stringify(err))
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('employees').delete().eq('id', id)
    if (error) { setSaveError(error.message); return }
    setConfirmDeleteId(null)
    await loadData()
  }

  function toggleTeam(teamId: string) {
    setFormData((prev) => ({
      ...prev,
      selectedTeamIds: prev.selectedTeamIds.includes(teamId)
        ? prev.selectedTeamIds.filter((id) => id !== teamId)
        : [...prev.selectedTeamIds, teamId],
    }))
  }

  if (loading) return <div className="flex items-center justify-center h-full text-gray-400 text-sm">Chargement…</div>

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employés</h1>
          <p className="text-gray-500 text-sm mt-1">{employees.length} employé{employees.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExcel
            label="employés"
            templateFilename="modele_employes.xlsx"
            columns={['last_name','first_name','email','phone','contract_type','statut','fonction','weekly_contract_hours','matricule','work_days_per_week','equipe_principale','equipe_secondaire']}
            onParse={rows => {
              const valid: any[] = []; const errors: string[] = []
              rows.forEach((r: any, i) => {
                if (!r.last_name || !r.first_name || !r.email) { errors.push(`Ligne ${i+2} : nom, prénom et email requis`); return }
                if (!['CDI','CDD','extra'].includes(String(r.contract_type ?? ''))) { errors.push(`Ligne ${i+2} : contract_type doit être CDI, CDD ou extra`); return }
                valid.push(r)
              })
              return { valid, errors }
            }}
            onImport={async rows => {
              for (const r of rows) {
                // Créer ou récupérer l'employé
                const payload = {
                  last_name: String(r.last_name).trim(),
                  first_name: String(r.first_name).trim(),
                  email: String(r.email).trim().toLowerCase(),
                  phone: r.phone ? String(r.phone).trim() : null,
                  matricule: r.matricule ? String(r.matricule).trim() : null,
                  contract_type: r.contract_type,
                  statut: r.statut || null,
                  fonction: r.fonction ? String(r.fonction).trim() : null,
                  weekly_contract_hours: r.weekly_contract_hours ? parseFloat(String(r.weekly_contract_hours)) : null,
                  work_days_per_week: r.work_days_per_week ? parseInt(String(r.work_days_per_week)) : null,
                  is_active: true,
                }
                const { data: empData, error: empErr } = await supabase
                  .from('employees').upsert(payload, { onConflict: 'email' }).select('id').single()
                if (empErr || !empData) continue
                const empId = empData.id
                // Créer les liens équipes
                for (const [field, isPrimary] of [['equipe_principale', true], ['equipe_secondaire', false]] as const) {
                  const teamName = r[field] ? String(r[field]).trim() : null
                  if (!teamName) continue
                  const { data: teamData } = await supabase.from('teams').select('id').ilike('name', teamName).maybeSingle()
                  if (teamData) {
                    await supabase.from('employee_teams').upsert(
                      { employee_id: empId, team_id: teamData.id, is_primary: isPrimary },
                      { onConflict: 'employee_id,team_id' }
                    )
                  }
                }
              }
              await loadData()
            }}
          />
          <button onClick={openAdd} className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Ajouter un employé
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm mb-6">Erreur : {error}</div>}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nom</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Matricule</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fonction</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Statut</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Contrat</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">H/sem</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">J/sem</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">H/j</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Équipes</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {employees.length === 0 && (
              <tr><td colSpan={10} className="px-5 py-10 text-center text-gray-400">Aucun employé</td></tr>
            )}
            {employees.map((emp) => (
              <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3.5">
                  <span className="font-medium text-gray-900">{emp.last_name}</span>{' '}
                  <span className="text-gray-600">{emp.first_name}</span>
                </td>
                <td className="px-5 py-3.5 text-gray-500 font-mono text-xs">
                  {emp.matricule || <span className="text-gray-300">—</span>}
                </td>
                <td className="px-5 py-3.5 text-gray-600">
                  {emp.fonction || <span className="text-gray-300">—</span>}
                </td>
                <td className="px-5 py-3.5"><StatutBadge statut={emp.statut} /></td>
                <td className="px-5 py-3.5"><ContractBadge type={emp.contract_type} /></td>
                <td className="px-5 py-3.5 text-right text-gray-600">
                  {emp.weekly_contract_hours != null ? `${emp.weekly_contract_hours}h` : '—'}
                </td>
                <td className="px-5 py-3.5 text-right text-gray-600">
                  {emp.work_days_per_week != null ? emp.work_days_per_week : '—'}
                </td>
                <td className="px-5 py-3.5 text-right text-gray-600">
                  {emp.daily_hours != null ? `${emp.daily_hours}h` : '—'}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex flex-wrap gap-1">
                    {emp.teams.length === 0 && <span className="text-gray-400">—</span>}
                    {emp.teams.map((t) => (
                      <span key={t.team_id} className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${t.is_primary ? 'bg-slate-100 text-slate-700' : 'bg-gray-100 text-gray-500'}`}>
                        {teamLabel(t)}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => openEdit(emp)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={() => setConfirmDeleteId(emp.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal title={editingEmployee ? "Modifier l'employé" : 'Nouvel employé'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            {/* Prénom + Nom */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Prénom *">
                <input type="text" value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} className="input" placeholder="Sophie" autoFocus />
              </Field>
              <Field label="Nom *">
                <input type="text" value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} className="input" placeholder="Marchand" />
              </Field>
            </div>

            {/* Email */}
            <Field label="Email *">
              <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="input" placeholder="sophie.marchand@louvre.fr" />
            </Field>

            {/* Matricule + Téléphone */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Matricule">
                <input type="text" value={formData.matricule} onChange={(e) => setFormData({ ...formData, matricule: e.target.value })} className="input font-mono" placeholder="EMP-001" />
              </Field>
              <Field label="Téléphone">
                <input type="text" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="input" placeholder="06 10 11 12 13" />
              </Field>
            </div>

            {/* Statut + Fonction */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Statut">
                <select value={formData.statut} onChange={(e) => setFormData({ ...formData, statut: e.target.value as FormData['statut'] })} className="input">
                  <option value="">— Non renseigné —</option>
                  <option value="cadre">Cadre</option>
                  <option value="agent_de_maitrise">Agent de maîtrise</option>
                  <option value="employe">Employé</option>
                </select>
              </Field>
              <Field label="Fonction">
                <select value={formData.fonction} onChange={(e) => setFormData({ ...formData, fonction: e.target.value })} className="input">
                  <option value="">— Non renseigné —</option>
                  {jobFunctions.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                </select>
              </Field>
            </div>

            {/* Contrat + H/sem */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Contrat *">
                <select value={formData.contract_type} onChange={(e) => setFormData({ ...formData, contract_type: e.target.value as FormData['contract_type'], weekly_contract_hours: e.target.value === 'extra' ? '' : formData.weekly_contract_hours })} className="input">
                  <option value="CDI">CDI</option>
                  <option value="CDD">CDD</option>
                  <option value="extra">Extra</option>
                </select>
              </Field>
              <Field label="Heures / semaine">
                <input type="number" value={formData.weekly_contract_hours} onChange={(e) => setFormData({ ...formData, weekly_contract_hours: e.target.value })} className="input disabled:bg-gray-50 disabled:text-gray-400" placeholder="35" disabled={formData.contract_type === 'extra'} min={1} max={48} step={0.5} />
              </Field>
            </div>

            {/* Jours/sem + Heures/jour */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Jours travaillés / semaine">
                <input type="number" value={formData.work_days_per_week} onChange={(e) => setFormData({ ...formData, work_days_per_week: e.target.value })} className="input" placeholder="5" min={1} max={7} step={1} />
              </Field>
              <Field label="Horaire journalier (h)">
                <input type="number" value={formData.daily_hours} onChange={(e) => setFormData({ ...formData, daily_hours: e.target.value })} className="input font-mono" placeholder="7.0" min={0} max={24} step={0.5} />
              </Field>
            </div>

            {/* Équipes */}
            <Field label="Équipes">
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-44 overflow-y-auto">
                {allTeams.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">Aucune équipe disponible</p>}
                {allTeams.map((team) => (
                  <label key={team.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={formData.selectedTeamIds.includes(team.id)} onChange={() => toggleTeam(team.id)} className="rounded border-gray-300 text-slate-900" />
                    <span className="text-sm text-gray-700">
                      {teamLabel(team)}
                      {formData.selectedTeamIds[0] === team.id && (
                        <span className="ml-2 text-xs text-slate-500">(principale)</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">La première équipe cochée sera l'équipe principale.</p>
            </Field>
          </div>

          {saveError && (
            <div className="mt-4 bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm">Erreur : {saveError}</div>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving || !formData.first_name.trim() || !formData.last_name.trim() || !formData.email.trim()} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <Modal title="Supprimer l'employé" onClose={() => setConfirmDeleteId(null)}>
          <p className="text-sm text-gray-600">Cette action est irréversible. Toutes les affectations et plannings de cet employé seront également supprimés.</p>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setConfirmDeleteId(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Annuler
            </button>
            <button onClick={() => handleDelete(confirmDeleteId)} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors">
              Supprimer
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function StatutBadge({ statut }: { statut: string | null }) {
  if (!statut) return <span className="text-gray-300">—</span>
  const styles: Record<string, string> = {
    cadre: 'bg-purple-50 text-purple-700',
    agent_de_maitrise: 'bg-blue-50 text-blue-700',
    employe: 'bg-gray-100 text-gray-600',
  }
  const labels: Record<string, string> = {
    cadre: 'Cadre',
    agent_de_maitrise: 'Agent de maîtrise',
    employe: 'Employé',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[statut] ?? 'bg-gray-100 text-gray-600'}`}>
      {labels[statut] ?? statut}
    </span>
  )
}

function ContractBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    CDI: 'bg-emerald-50 text-emerald-700',
    CDD: 'bg-amber-50 text-amber-700',
    extra: 'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[type] ?? 'bg-gray-100 text-gray-600'}`}>
      {type}
    </span>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}
