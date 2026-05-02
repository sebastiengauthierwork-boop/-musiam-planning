import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  console.log('[create-user] Route atteinte')

  const authHeader = req.headers.get('Authorization')
  console.log('[create-user] Authorization header:', authHeader ? 'présent' : 'absent')

  if (!authHeader?.startsWith('Bearer ')) {
    console.log('[create-user] Header manquant ou mal formé')
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  const token = authHeader.slice(7)
  console.log('[create-user] Token reçu (20 premiers chars):', token.slice(0, 20))

  // Vérifier la service role key en premier
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    console.log('[create-user] SUPABASE_SERVICE_ROLE_KEY manquante')
    return NextResponse.json({ error: 'Configuration serveur manquante (SUPABASE_SERVICE_ROLE_KEY)' }, { status: 500 })
  }

  // Utiliser le service role key pour valider le token ET lire le profil.
  // La anon key seule ne suffit pas : les RLS bloquent la lecture de users
  // quand le JWT de l'utilisateur n'est pas inclus dans les headers du client.
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: { user: caller }, error: authError } = await adminClient.auth.getUser(token)
  console.log('[create-user] User depuis token:', caller?.id ?? 'null', '| Erreur auth:', authError?.message ?? 'aucune')

  if (authError || !caller) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const { data: callerProfile, error: profileError } = await adminClient
    .from('users').select('role').eq('id', caller.id).single()
  console.log('[create-user] Profil:', JSON.stringify(callerProfile), '| Erreur profil:', profileError?.message ?? 'aucune')

  if (!callerProfile || !['admin', 'responsable'].includes(callerProfile.role)) {
    console.log('[create-user] Accès refusé — rôle reçu:', callerProfile?.role ?? 'null')
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  console.log('[create-user] Appelant autorisé — rôle:', callerProfile.role)

  const body = await req.json()
  const { email, password, role, employee_id, allowed_teams, allowed_site_id } = body

  if (!email || !password) {
    return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 })
  }

  const emailNorm = String(email).trim().toLowerCase()

  // Créer le compte Auth sans email de confirmation
  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email: emailNorm,
    password,
    email_confirm: true,
  })
  console.log('[create-user] Création Auth:', newUser?.user?.id ?? 'null', '| Erreur:', createError?.message ?? 'aucune')

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
  console.log('[create-user] Insert users:', insertError?.message ?? 'OK')

  if (insertError) {
    await adminClient.auth.admin.deleteUser(authUserId)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  console.log('[create-user] Succès — userId:', authUserId)
  return NextResponse.json({ success: true, userId: authUserId })
}
