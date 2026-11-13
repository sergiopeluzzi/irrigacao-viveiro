import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'

export const inputCls =
  'w-full rounded-lg border border-line bg-white px-3 py-2.5 text-base text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-sand'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  small?: boolean
}

export function Button({ variant = 'primary', small, className = '', ...props }: BtnProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition disabled:opacity-50 disabled:pointer-events-none'
  const tam = small ? 'px-3.5 py-1.5 text-sm' : 'px-5 py-2.5 text-sm'
  const cor = {
    primary: 'bg-brand text-white hover:bg-brand-dark',
    secondary: 'border border-line bg-white text-ink hover:bg-sand',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
    ghost: 'text-brand hover:bg-sand',
  }[variant]
  return <button type="button" className={`${base} ${tam} ${cor} ${className}`} {...props} />
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-white p-4 ${className}`}>{children}</div>
}

export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>{children}</span>
  )
}

export function PageHeader({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-serif text-2xl text-ink">{titulo}</h1>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">{children}</p>
}

export function Erro({ erro }: { erro: unknown }) {
  if (!erro) return null
  return (
    <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
      {erro instanceof Error ? erro.message : 'Algo deu errado.'}
    </p>
  )
}

export function Carregando() {
  return <p className="py-10 text-center text-sm text-muted">Carregando…</p>
}

/** No celular abre como "bottom sheet"; no desktop, como diálogo centralizado. */
export function Modal({
  aberto,
  onFechar,
  titulo,
  children,
  largo,
}: {
  aberto: boolean
  onFechar: () => void
  titulo: string
  children: ReactNode
  largo?: boolean
}) {
  useEffect(() => {
    if (!aberto) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    document.addEventListener('keydown', esc)
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', esc)
      document.body.style.overflow = anterior
    }
  }, [aberto, onFechar])

  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onMouseDown={(e) => e.stopPropagation()}
        className={`flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-cream shadow-xl sm:rounded-3xl ${largo ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-serif text-lg">{titulo}</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-full p-1 text-2xl leading-none text-muted hover:bg-sand">
            ×
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
