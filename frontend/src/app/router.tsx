import type { ComponentType } from 'react'
import { createBrowserRouter, type LoaderFunction, type RouteObject } from 'react-router'
import type { PanelSection } from '@/components/layout/panel-navigation'
import { SeccionNoDisponible } from '@/components/layout/seccion-no-disponible'
import { SeccionPendiente } from '@/components/layout/seccion-pendiente'
import { AjustadoresAseguradoraPage } from '@/features/aseguradoras/pages/ajustadores-aseguradora-page'
import { cargarAseguradoras, cargarAjustadoresAseguradora } from '@/features/aseguradoras/loader'
import { AseguradorasPage } from '@/features/aseguradoras/pages/aseguradoras-page'
import { LoginPage } from '@/features/auth/pages/login-page'
import { RecuperarContrasenaPage } from '@/features/auth/pages/recuperar-contrasena-page'
import {
  cargarPanel,
  irAInicio,
  redirigirSiHaySesion,
  requerirSeccion,
  salir,
} from '@/features/auth/sesion'
import { DashboardPage } from '@/features/dashboard/pages/dashboard-page'
import { PerfilPage } from '@/features/perfil/pages/perfil-page'
import { ErrorPagina } from '@/pages/error-pagina'
import { Panel } from './panel'
import { Raiz } from './raiz'

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

// Página de cada sección del panel. Cada historia reemplaza su SeccionPendiente por la página real de la feature.
const secciones: Record<PanelSection, ComponentType> = {
  dashboard: DashboardPage,
  siniestros: () => <SeccionPendiente section="siniestros" />,
  plantillas: () => <SeccionPendiente section="plantillas" />,
  aseguradoras: AseguradorasPage,
  ajustadores: () => <SeccionPendiente section="ajustadores" />,
  usuarios: () => <SeccionPendiente section="usuarios" />,
  informes: () => <SeccionPendiente section="informes" />,
  perfil: PerfilPage,
}

// Loader propio de las secciones que traen datos. Tiene que llamar a requerirSeccion antes de pedirlos.
const loaders: Partial<Record<PanelSection, LoaderFunction>> = {
  aseguradoras: cargarAseguradoras,
}

export const router = createBrowserRouter([
  {
    Component: Raiz,
    errorElement: <ErrorPagina />,
    children: [
      // Pantallas de acceso: sin sesión
      { path: '/login', loader: redirigirSiHaySesion, Component: LoginPage },
      { path: '/recuperar-contrasena', Component: RecuperarContrasenaPage },
      { path: '/salir', action: salir },

      // Panel: exige sesión. Cada sección controla el rol en su loader antes de mostrarse.
      {
        id: 'panel',
        path: '/',
        loader: cargarPanel,
        Component: Panel,
        errorElement: <ErrorPagina />,
        children: [
          { index: true, loader: irAInicio },
          {
            // Sin path: sus errores (403 por rol, fallas al cargar) se muestran dentro del panel, con el menú
            errorElement: <SeccionNoDisponible />,
            children: [
              {
                path: 'aseguradoras/:idAseguradora/ajustadores',
                loader: cargarAjustadoresAseguradora,
                Component: AjustadoresAseguradoraPage,
              },
              ...Object.entries(secciones).map(([seccion, Component]): RouteObject => ({
                path: seccion,
                loader:
                  loaders[seccion as PanelSection] ?? requerirSeccion(seccion as PanelSection),
                Component,
              })),
              { path: '*', Component: SeccionNoDisponible },
            ],
          },
        ],
      },

      ...developmentRoutes,
    ],
  },
])
