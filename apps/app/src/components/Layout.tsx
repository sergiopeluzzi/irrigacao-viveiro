import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth'
import { useControlador } from '../controlador'

const ITENS = [
  { to: '/', rotulo: 'Painel', icone: '💧', fim: true },
  { to: '/rotinas', rotulo: 'Rotinas', icone: '🕒' },
  { to: '/setores', rotulo: 'Setores', icone: '🌱' },
  { to: '/historico', rotulo: 'Histórico', icone: '📜' },
  { to: '/ajustes', rotulo: 'Ajustes', icone: '⚙️' },
]

export function StatusConexao({ compacto }: { compacto?: boolean }) {
  const { controlador, tempoRealConectado } = useControlador()
  const ok = controlador.online && controlador.brokerConectado
  const texto = !controlador.brokerConectado ? 'Servidor sem MQTT' : controlador.online ? 'Online' : 'Offline'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}
      title={tempoRealConectado ? 'Atualizando em tempo real' : 'Reconectando ao servidor…'}
    >
      <span className={`size-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-rose-500'} ${tempoRealConectado ? '' : 'pulsar'}`} />
      {compacto ? texto : `Controlador ${texto.toLowerCase()}`}
    </span>
  )
}

export default function Layout() {
  const { usuario } = useAuth()
  const { controlador, lista, selecionar } = useControlador()

  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col self-start border-r border-line bg-white p-5 md:flex">
        <p className="font-serif text-xl text-brand">Irrigação</p>
        <p className="mb-5 text-xs text-muted">Olá, {usuario?.nome.split(' ')[0]}</p>
        <nav className="flex flex-col gap-1">
          {ITENS.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.fim}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium ${isActive ? 'bg-sand text-brand' : 'text-ink hover:bg-sand/60'}`
              }
            >
              <span aria-hidden>{i.icone}</span>
              {i.rotulo}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-white/90 px-4 py-2.5 backdrop-blur md:px-8">
          {lista.length > 1 ? (
            <select
              className="rounded-lg border border-line bg-white px-2 py-1 text-sm font-semibold"
              value={controlador.id}
              onChange={(e) => selecionar(e.target.value)}
              aria-label="Controlador"
            >
              {lista.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          ) : (
            <p className="truncate font-semibold">{controlador.nome}</p>
          )}
          <StatusConexao compacto />
        </header>
        <main className="mx-auto w-full max-w-4xl px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-10">
          <Outlet />
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Navegação principal"
      >
        {ITENS.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.fim}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-brand' : 'text-muted'}`
            }
          >
            <span className="text-lg" aria-hidden>
              {i.icone}
            </span>
            {i.rotulo}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
