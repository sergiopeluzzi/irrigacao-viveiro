import { Navigate, Route, Routes } from 'react-router'
import { useAuth } from './auth'
import Layout from './components/Layout'
import { Carregando } from './components/ui'
import { ControladorProvider } from './controlador'
import Ajustes from './pages/Ajustes'
import Historico from './pages/Historico'
import Login from './pages/Login'
import Painel from './pages/Painel'
import Rotinas from './pages/Rotinas'
import Setores from './pages/Setores'

export default function App() {
  const { usuario, carregando } = useAuth()
  if (carregando) return <Carregando />
  if (!usuario) return <Login />

  return (
    <ControladorProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Painel />} />
          <Route path="rotinas" element={<Rotinas />} />
          <Route path="setores" element={<Setores />} />
          <Route path="historico" element={<Historico />} />
          <Route path="ajustes" element={<Ajustes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ControladorProvider>
  )
}
