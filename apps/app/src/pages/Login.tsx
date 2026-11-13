import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth'
import { Button, Erro, Field, inputCls } from '../components/ui'

export default function Login() {
  const { entrar } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<unknown>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setErro(null)
    try {
      await entrar(email, senha)
    } catch (err) {
      setErro(err)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={enviar} className="w-full max-w-sm space-y-4 rounded-3xl border border-line bg-white p-6 shadow-sm">
        <div className="text-center">
          <h1 className="font-serif text-2xl text-brand">💧 Irrigação do Viveiro</h1>
          <p className="text-sm text-muted">Entre para continuar</p>
        </div>
        <Field label="E-mail">
          <input className={inputCls} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Senha">
          <input className={inputCls} type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
        </Field>
        <Erro erro={erro} />
        <Button type="submit" className="w-full" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </div>
  )
}
