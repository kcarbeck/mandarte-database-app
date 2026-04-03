'use client'
import { useState, useEffect } from 'react'

const APP_PASSWORD = process.env.NEXT_PUBLIC_APP_PASSWORD || ''

export default function AuthGate({ children }) {
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('mandarte_auth')
      if (stored === 'granted') setAuthed(true)
    }
    setChecking(false)
  }, [])

  function handleSubmit(e) {
    e.preventDefault()
    if (password === APP_PASSWORD) {
      localStorage.setItem('mandarte_auth', 'granted')
      setAuthed(true)
      setError('')
    } else {
      setError('Incorrect password')
      setPassword('')
    }
  }

  if (checking) return null

  if (!authed) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center p-4">
        <div className="card shadow-lg p-6 sm:p-8 w-full max-w-sm">
          <div className="mb-6 text-center">
            <div className="text-3xl mb-2">🦅</div>
            <h1 className="font-display text-2xl text-forest-800 mb-1">Mandarte Field App</h1>
            <p className="text-bark-500">W̱SÁNEĆ Territory Research</p>
          </div>

          <p className="text-sm text-bark-600 mb-6 text-center">Enter the field crew password to continue.</p>

          <form onSubmit={handleSubmit}>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              placeholder="Password"
              className="input w-full mb-3"
              autoFocus
            />
            {error && <p className="text-red-600 text-xs mb-3">{error}</p>}
            <button type="submit"
              className="btn-primary btn-lg w-full">
              Enter
            </button>
          </form>
          <p className="text-2xs text-bark-600 mt-6 text-center">
            Contact Katherine if you need the password.
          </p>
        </div>
      </div>
    )
  }

  return children
}
