import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { authApi, setToken } from './api'
import { connectSocket, disconnectSocket } from './socket'
import type { User } from './types'
import { AuthContext, TOKEN_KEY, USER_KEY } from './auth-context'
import { chatCache } from './cache'

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTok] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<User | null>(() => readStoredUser())
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      const stored = localStorage.getItem(TOKEN_KEY)
      if (stored) {
        setToken(stored)
        try {
          const { user } = await authApi.me()
          if (!cancelled) {
            setUser(user)
            localStorage.setItem(USER_KEY, JSON.stringify(user))
          }
          connectSocket(stored)
        } catch {
          if (!cancelled) {
            localStorage.removeItem(TOKEN_KEY)
            localStorage.removeItem(USER_KEY)
            setTok(null)
            setUser(null)
            disconnectSocket()
            void chatCache.clear()
          }
        }
      }
      if (!cancelled) setInitializing(false)
    }
    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  const applyAuth = useCallback((t: string, u: User) => {
    setToken(t)
    setTok(t)
    setUser(u)
    localStorage.setItem(TOKEN_KEY, t)
    localStorage.setItem(USER_KEY, JSON.stringify(u))
    connectSocket(t)
  }, [])

  const login = useCallback(
    async (identifier: string, password: string) => {
      const { token: t, user: u } = await authApi.login(identifier, password)
      applyAuth(t, u)
      return u
    },
    [applyAuth],
  )

  const register = useCallback(
    async (email: string, username: string, password: string, displayName?: string) => {
      const { token: t, user: u } = await authApi.register(email, username, password, displayName)
      applyAuth(t, u)
      return u
    },
    [applyAuth],
  )

  const logout = useCallback(() => {
    disconnectSocket()
    setToken(null)
    setTok(null)
    setUser(null)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    void chatCache.clear()
  }, [])

  const updateUser = useCallback((u: User) => {
    setUser(u)
    localStorage.setItem(USER_KEY, JSON.stringify(u))
  }, [])

  const value = useMemo(
    () => ({
      user,
      token,
      initializing,
      login,
      register,
      logout,
      updateUser,
    }),
    [user, token, initializing, login, register, logout, updateUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}