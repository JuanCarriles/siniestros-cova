import { createBrowserRouter, Link, type RouteObject } from 'react-router'
import { Button } from '@/components/ui/button'

const panelRoutes: RouteObject[] = import.meta.env.DEV
  ? (await import('./panel-preview-routes')).panelPreviewRoutes
  : []

const developmentRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/sistema-diseno',
        hydrateFallbackElement: (
          <p role="status" className="p-6 text-muted-foreground">
            Cargando componentes…
          </p>
        ),
        lazy: async () => {
          const { SistemaDiseno } = await import('@/pages/sistema-diseno')
          return { Component: SistemaDiseno }
        },
      },
    ]
  : []

// Las rutas de cada feature (login, siniestros, aseguradoras…) se registran acá a medida que se construyen.
export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <main className="grid min-h-screen place-items-center p-4">
        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-6 shadow-card">
          <div className="grid size-10 place-items-center rounded-md bg-brand-accent font-bold text-foreground">
            EC
          </div>
          <div>
            <p className="text-base font-bold text-navy">Estudio Cova</p>
            <p className="text-muted-foreground">Sistema de gestión de siniestros</p>
            {import.meta.env.DEV && (
              <div className="mt-4 flex flex-wrap gap-3">
                <Button asChild>
                  <Link to="/vista-previa">Ver interfaces por rol</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/sistema-diseno">Sistema de diseño</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>
    ),
  },
  ...developmentRoutes,
  ...panelRoutes,
])
