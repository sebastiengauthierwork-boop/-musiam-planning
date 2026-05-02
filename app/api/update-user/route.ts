import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  // Vérifier que l'appelant est admin uniquement
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
  if (!callerProfile || callerProfile.role !== 'admin') {
    return NextResponse.json({ error: 'Accès refusé — réservé aux administrateurs' }, { status: 403 })
  }

  const body = await req.json()
  const { user_id, new_email } = body

  if (!user_id || !new_email) {
    return NextResponse.json({ error: 'user_id et new_email requis' }, { status: 400 })
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

  const emailNorm = String(new_email).trim().toLowerCase()

  // Mettre à jour l'email dans Supabase Auth (sans confirmation)
  const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(user_id, {
    email: emailNorm,
    email_confirm: true,
  })
  if (updateAuthError) {
    return NextResponse.json({ error: updateAuthError.message }, { status: 400 })
  }

  // Mettre à jour la table users
  const { data: userProfile, error: updateProfileError } = await adminClient
    .from('users')
    .update({ email: emailNorm })
    .eq('id', user_id)
    .select('employee_id')
    .single()
  if (updateProfileError) {
    return NextResponse.json({ error: updateProfileError.message }, { status: 500 })
  }

  // Mettre à jour la table employees si l'utilisateur est lié à un salarié
  if (userProfile?.employee_id) {
    await adminClient
      .from('employees')
      .update({ email: emailNorm })
      .eq('id', userProfile.employee_id)
  }

  return NextResponse.json({ success: true })
}
