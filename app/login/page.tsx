'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [inactivityMsg, setInactivityMsg] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('reason') === 'inactivity') setInactivityMsg(true)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        setError(`Erreur : ${error.message} (${error.status ?? 'no status'})`)
        setLoading(false)
        return
      }

      window.location.href = '/planning'
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('Une erreur inattendue est survenue.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-md w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <h1 style={{ fontSize: 28 }} className="font-bold text-gray-900 leading-tight">Musiam Planning</h1>
          <p style={{ fontSize: 14 }} className="text-gray-400 italic mt-1">by Planekipe</p>
          <p style={{ fontSize: 12 }} className="text-gray-400 mt-0.5">Logiciel de planification RH</p>
        </div>

        {inactivityMsg && (
          <div className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
            Vous avez été déconnecté pour inactivité.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="vous@exemple.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg py-2 text-sm transition-colors"
          >
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
      </div>
      <p className="mt-6 text-center text-gray-400" style={{ fontSize: '11px' }}>
        Musiam Planning — Logiciel de planification RH<br />
        Conçu et développé par Sebastien Gauthier, Musiam-Paris ©
      </p>
    </div>
  )
}
