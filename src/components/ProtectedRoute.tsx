import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth-context'
import { Loader2 } from 'lucide-react'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token, initializing } = useAuth()

  if (initializing) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-white via-pink-50 to-pink-100">
        <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
      </div>
    )
  }
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}