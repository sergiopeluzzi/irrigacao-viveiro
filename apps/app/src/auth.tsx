import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, getToken, setToken } from './api'
import type { Usuario } from './types'

type AuthCtx = {
  usuario: Usuario | null
  carregando: boolean
  entrar: (email: string, senha: string) => Promise<void>
  sair: () => void
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [carregando, setCarregando] = useState(() => getToken() !== null)

  const sair = useCallback(() => {
    setToken(null)
    setUsuario(null)
  }, [])

  useEffect(() => {
    if (!getToken()) return
    api<Usuario>('/auth/me')
      .then(setUsuario)
      .catch(() => setToken(null))
      .finally(() => setCarregando(false))
  }, [])

  useEffect(() => {
    window.addEventListener('viveiro:logout', sair)
    return () => window.removeEventListener('viveiro:logout', sair)
  }, [sair])

  const entrar = async (email: string, senha: string) => {
    const r = await api<{ accessToken: string; usuario: Usuario }>('/auth/login', {
      method: 'POST',
      body: { email, senha },
    })
    setToken(r.accessToken)
    setUsuario(r.usuario)
  }

  return <Ctx.Provider value={{ usuario, carregando, entrar, sair }}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth fora do AuthProvider')
  return ctx
}
