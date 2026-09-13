import { createContext, useContext } from 'react'
import type { User } from './types'

export const TOKEN_KEY = 'tuuchat:token'
export const USER_KEY = 'tuuchat:user'

export interface AuthValue {
  user: User | null
  token: string | null
  initializing: boolean
  login: (identifier: string, password: string) => Promise<User>
  register: (email: string, username: string, password: string, displayName?: string) => Promise<User>
  logout: () => void
  updateUser: (u: User) => void
}

export const AuthContext = createContext<AuthValue | undefined>(undefined)

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}