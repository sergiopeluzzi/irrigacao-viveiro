const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3002').replace(/\/$/, '')
const TOKEN_KEY = 'viveiro.token'

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}
export const setToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* armazenamento indisponível */
  }
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type Opcoes = { method?: string; body?: unknown; form?: FormData }

export async function api<T>(path: string, { method = 'GET', body, form }: Opcoes = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  })

  const texto = await res.text()
  const dados = texto ? JSON.parse(texto) : null

  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') {
      setToken(null)
      window.dispatchEvent(new Event('viveiro:logout'))
    }
    const msg = Array.isArray(dados?.message) ? dados.message.join(' · ') : dados?.message
    throw new ApiError(res.status, msg ?? 'Erro inesperado. Tente novamente.')
  }
  return dados as T
}

export const API_BASE = BASE
