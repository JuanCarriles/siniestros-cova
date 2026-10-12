import { createBrowserRouter } from 'react-router'

// Las rutas de cada feature (login, siniestros, aseguradoras…) se registran acá a medida que se construyen.
export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <main className="grid min-h-screen place-items-center p-4">
        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-6 shadow-card">
          <div className="grid size-10 place-items-center rounded-md bg-accent font-bold text-white">EC</div>
          <div>
            <p className="text-base font-bold text-navy">Estudio Cova</p>
            <p className="text-muted">Sistema de gestión de siniestros</p>
          </div>
        </div>
      </main>
    ),
  },
])
