import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Aviso = { id: number; texto: string; erro?: boolean }
type Ctx = (texto: string, erro?: boolean) => void

const Contexto = createContext<Ctx>(() => {})

/** Mensagens rápidas no rodapé ("Pausa ativada", "Erro: ..."). */
export function AvisoProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const avisar = useCallback<Ctx>((texto, erro) => {
    const id = Date.now() + Math.random()
    setAvisos((a) => [...a, { id, texto, erro }])
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), erro ? 7000 : 3500)
  }, [])

  return (
    <Contexto.Provider value={avisar}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {avisos.map((a) => (
          <div
            key={a.id}
            role="status"
            className={`max-w-md rounded-xl px-4 py-2.5 text-sm whitespace-pre-line shadow-lg ${a.erro ? 'bg-rose-700 text-white' : 'bg-ink text-white'}`}
          >
            {a.texto}
          </div>
        ))}
      </div>
    </Contexto.Provider>
  )
}

export const useAviso = () => useContext(Contexto)
