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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Mandarte Field App</h1>
          <p className="text-sm text-gray-500 mb-6">Enter the field crew password to continue.</p>
          <form onSubmit={handleSubmit}>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              placeholder="Password"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            {error && <p className="text-red-500 text-xs mb-3">{error}</p>}
            <button type="submit"
              className="w-full bg-blue-600 text-white rounded-lg py-3 text-sm font-medium hover:bg-blue-700">
              Enter
            </button>
          </form>
          <p className="text-xs text-gray-400 mt-4 text-center">
            Contact Katherine if you need the password.
          </p>
        </div>
      </div>
    )
  }

  return children
}
