import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Route protection is handled client-side by AuthProvider in lib/auth.tsx.
// The middleware does nothing except let all requests through.
export function middleware(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
