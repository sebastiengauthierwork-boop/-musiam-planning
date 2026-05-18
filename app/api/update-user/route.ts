import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'Configuration serveur manquante (SUPABASE_SERVICE_ROLE_KEY)' }, { status: 500 })
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: { user: caller }, error: authError } = await adminClient.auth.getUser(token)
  if (authError || !caller) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const { data: callerProfile } = await adminClient
    .from('users').select('role').eq('id', caller.id).single()
  if (!callerProfile || !['superadmin', 'admin', 'responsable'].includes(callerProfile.role)) {
    return NextResponse.json({ error: 'Accès refusé — réservé aux administrateurs et responsables' }, { status: 403 })
  }

  const body = await req.json()
  const { user_id, new_email, new_password } = body

  if (!user_id) {
    return NextResponse.json({ error: 'user_id requis' }, { status: 400 })
  }

  // ── Reset mot de passe uniquement ──────────────────────────────────────────
  if (new_password) {
    const { error: pwError } = await adminClient.auth.admin.updateUserById(user_id, {
      password: new_password,
    })
    if (pwError) return NextResponse.json({ error: pwError.message }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  // ── Modification email ─────────────────────────────────────────────────────
  if (!new_email) {
    return NextResponse.json({ error: 'new_email ou new_password requis' }, { status: 400 })
  }

  if (!['superadmin', 'admin'].includes(callerProfile.role)) {
    return NextResponse.json({ error: 'Modification d\'email réservée aux administrateurs' }, { status: 403 })
  }

  const emailNorm = String(new_email).trim().toLowerCase()

  const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(user_id, {
    email: emailNorm,
    email_confirm: true,
  })
  if (updateAuthError) {
    return NextResponse.json({ error: updateAuthError.message }, { status: 400 })
  }

  const { data: userProfile, error: updateProfileError } = await adminClient
    .from('users')
    .update({ email: emailNorm })
    .eq('id', user_id)
    .select('employee_id')
    .single()
  if (updateProfileError) {
    return NextResponse.json({ error: updateProfileError.message }, { status: 500 })
  }

  if (userProfile?.employee_id) {
    await adminClient
      .from('employees')
      .update({ email: emailNorm })
      .eq('id', userProfile.employee_id)
  }

  return NextResponse.json({ success: true })
}
