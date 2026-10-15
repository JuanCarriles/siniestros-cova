import { createBrowserRouter, Link, type RouteObject } from 'react-router'
import { Button } from '@/components/ui/button'

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
              <Button asChild variant="link" size="sm" className="mt-2 px-0">
                <Link to="/sistema-diseno">Ver sistema de diseño</Link>
              </Button>
            )}
          </div>
        </div>
      </main>
    ),
  },
  ...developmentRoutes,
])
