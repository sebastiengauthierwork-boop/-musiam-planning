import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function generateLoginCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = 'MP-'
  for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length))
  return code
}

async function getUniqueLoginCode(adminClient: any): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateLoginCode()
    const { data } = await adminClient.from('users').select('id').eq('login_code', code).maybeSingle()
    if (!data) return code
  }
  throw new Error('Impossible de générer un identifiant unique')
}

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
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const body = await req.json()
  const { email, password, role, employee_id, allowed_teams, allowed_site_id } = body

  if (!password) {
    return NextResponse.json({ error: 'Mot de passe requis' }, { status: 400 })
  }

  const isSalarie = (role ?? 'salarie') === 'salarie'

  let emailNorm: string
  let loginCode: string | null = null

  if (isSalarie) {
    loginCode = await getUniqueLoginCode(adminClient)
    emailNorm = `${loginCode}@planekipe.local`
  } else {
    if (!email) return NextResponse.json({ error: 'Email requis' }, { status: 400 })
    emailNorm = String(email).trim().toLowerCase()
  }

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

  const { error: insertError } = await adminClient.from('users').insert({
    id: authUserId,
    email: emailNorm,
    login_code: loginCode,
    role: role ?? 'salarie',
    allowed_teams: role === 'manager' ? (allowed_teams ?? []) : [],
    allowed_site_id: role === 'responsable' ? (allowed_site_id ?? null) : null,
    employee_id: employee_id ?? null,
  })

  if (insertError) {
    await adminClient.auth.admin.deleteUser(authUserId)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, userId: authUserId, login_code: loginCode })
}
