import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  // Vérifier que l'appelant est connecté et est admin ou responsable
  const callerClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { user: caller }, error: authError } = await callerClient.auth.getUser(token)
  if (authError || !caller) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const { data: callerProfile } = await callerClient
    .from('users').select('role').eq('id', caller.id).single()
  if (!callerProfile || !['admin', 'responsable'].includes(callerProfile.role)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const body = await req.json()
  const { email, password, role, employee_id, allowed_teams, allowed_site_id } = body

  if (!email || !password) {
    return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'Configuration serveur manquante (SUPABASE_SERVICE_ROLE_KEY)' }, { status: 500 })
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const emailNorm = String(email).trim().toLowerCase()

  // Créer le compte Auth sans email de confirmation
  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email: emailNorm,
    password,
    email_confirm: true,
  })

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 })
  }

  const authUserId = newUser.user?.id
  if (!authUserId) {
    return NextResponse.json({ error: 'Erreur lors de la création du compte Auth' }, { status: 500 })
  }

  // Insérer dans la table users
  const { error: insertError } = await adminClient.from('users').insert({
    id: authUserId,
    email: emailNorm,
    role: role ?? 'salarie',
    allowed_teams: role === 'manager' ? (allowed_teams ?? []) : [],
    allowed_site_id: role === 'responsable' ? (allowed_site_id ?? null) : null,
    employee_id: employee_id ?? null,
  })

  if (insertError) {
    await adminClient.auth.admin.deleteUser(authUserId)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, userId: authUserId })
}
