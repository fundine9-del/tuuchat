import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { MessageCircle, Loader2 } from 'lucide-react'
import { useAuth } from '../lib/auth-context'

export default function Signup() {
  const { register, token } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (token) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await register(email.trim(), username.trim(), password, displayName.trim() || undefined)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-white via-pink-50 to-pink-100">
      {/* brand panel */}
      <div className="hidden flex-1 flex-col justify-between bg-gradient-to-br from-pink-400 via-pink-300 to-rose-300 p-12 lg:flex">
        <div className="flex items-center gap-3 text-white">
          <MessageCircle className="h-9 w-9" />
          <span className="text-2xl font-bold">Tuuchat</span>
        </div>
        <div>
          <h1 className="max-w-md text-4xl font-bold leading-tight text-white">
            Join Tuuchat. Your conversations, wherever you are.
          </h1>
          <p className="mt-4 max-w-md text-pink-50">
            Create an account and start chatting in seconds.
          </p>
        </div>
        <p className="text-sm text-pink-100/90">© {new Date().getFullYear()} Tuuchat</p>
      </div>

      {/* form */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-3xl border border-pink-100 bg-white/80 p-8 shadow-lg backdrop-blur">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <MessageCircle className="h-7 w-7 text-pink-500" />
            <span className="text-xl font-bold text-slate-800">Tuuchat</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Create your account</h2>
          <p className="mt-1 mb-6 text-sm text-slate-500">Free forever, no credit card needed</p>

          <form onSubmit={onSubmit} className="space-y-3.5">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Display name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-xl border border-pink-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-pink-500"
                placeholder="Jane Doe"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full rounded-xl border border-pink-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-pink-500"
                placeholder="janedoe"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-xl border border-pink-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-pink-500"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-xl border border-pink-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-pink-500"
                placeholder="At least 6 characters"
              />
            </div>

            {error && <p className="text-sm text-rose-500">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-rose-400 py-2.5 text-sm font-semibold text-white transition hover:from-pink-600 hover:to-rose-500 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Create account
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-pink-600 hover:text-pink-500">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}