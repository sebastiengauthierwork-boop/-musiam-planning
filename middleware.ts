import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Build a mutable response so @supabase/ssr can set/refresh cookies
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // First apply to the request so downstream server components see them
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // Rebuild response with updated request headers
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          // Then apply to the response so the browser receives them
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Retrieve session (also refreshes the access token when needed)
  const { data: sessionData } = await supabase.auth.getSession()

  // No session → redirect to /login (preserve intended destination)
  if (!sessionData.session) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Role-based access: managers cannot reach /parametrage or /admin/*
  const isRestricted =
    pathname.startsWith('/parametrage') || pathname.startsWith('/admin')

  if (isRestricted) {
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', sessionData.session.user.id)
      .single()

    if (userData?.role === 'manager') {
      const planningUrl = request.nextUrl.clone()
      planningUrl.pathname = '/planning'
      planningUrl.search = ''
      return NextResponse.redirect(planningUrl)
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login).*)'],
}
