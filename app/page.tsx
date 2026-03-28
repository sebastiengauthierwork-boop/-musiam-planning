import { supabase } from '@/lib/supabase'

async function checkSupabaseConnection() {
  try {
    const { error } = await supabase.from('_test_connection').select('*').limit(1)
    // A "relation does not exist" error means Supabase is reachable but the table doesn't exist
    if (error && error.code === '42P01') {
      return { connected: true, message: 'Supabase connecté avec succès' }
    }
    if (error) {
      return { connected: false, message: `Erreur: ${error.message}` }
    }
    return { connected: true, message: 'Supabase connecté avec succès' }
  } catch {
    return { connected: false, message: 'Impossible de se connecter à Supabase' }
  }
}

export default async function Home() {
  const { connected, message } = await checkSupabaseConnection()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
      <div className="text-center space-y-6">
        <h1 className="text-5xl font-bold text-gray-900">Musiam Planning</h1>
        <p className="text-lg text-gray-500">Plateforme de gestion musicale</p>

        <div
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
            connected
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-800'
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
          />
          {message}
        </div>
      </div>
    </main>
  )
}
