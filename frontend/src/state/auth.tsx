import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError, api } from '@/lib/api'
import type { User } from '@/lib/types'

interface AuthValue {
  user: User | null
  status: 'checking' | 'ready'
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<'checking' | 'ready'>('checking')

  useEffect(() => {
    let cancelled = false
    api
      .get<User>('/auth/me')
      .then((value) => {
        if (!cancelled) setUser(value)
      })
      .catch((error) => {
        // A 401 here is the normal signed-out case, not a failure worth showing.
        if (!cancelled && !(error instanceof ApiError && error.status === 401)) {
          console.error(error)
        }
      })
      .finally(() => {
        if (!cancelled) setStatus('ready')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    setUser(await api.post<User>('/auth/login', { email, password }))
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    setUser(await api.post<User>('/auth/signup', { email, password }))
  }, [])

  const signOut = useCallback(async () => {
    await api.post('/auth/logout')
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, status, signIn, signUp, signOut }),
    [user, status, signIn, signUp, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
