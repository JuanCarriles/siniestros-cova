import type { ComponentType } from 'react'
import { createBrowserRouter, type LoaderFunction, type RouteObject } from 'react-router'
import type { PanelSection } from '@/components/layout/panel-navigation'
import { SeccionNoDisponible } from '@/components/layout/seccion-no-disponible'
import { SeccionPendiente } from '@/components/layout/seccion-pendiente'
import { cargarAjustadores } from '@/features/ajustadores/loader'
import { AjustadoresPage } from '@/features/ajustadores/pages/ajustadores-page'
import { cargarAseguradoras } from '@/features/aseguradoras/loader'
import {
  cargarAltaSiniestro,
  cargarFichaSiniestro,
  cargarSiniestros,
} from '@/features/siniestros/loader'
import { AltaSiniestroPage } from '@/features/siniestros/pages/alta-siniestro-page'
import { FichaSiniestroPage } from '@/features/siniestros/pages/ficha-siniestro-page'
import { SiniestrosPage } from '@/features/siniestros/pages/siniestros-page'
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
import { cargarUsuarios } from '@/features/usuarios/loader'
import { UsuariosPage } from '@/features/usuarios/pages/usuarios-page'
import { cargarPerfil } from '@/features/perfil/loader'
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
  siniestros: SiniestrosPage,
  plantillas: () => <SeccionPendiente section="plantillas" />,
  aseguradoras: AseguradorasPage,
  ajustadores: AjustadoresPage,
  usuarios: UsuariosPage,
  informes: () => <SeccionPendiente section="informes" />,
  perfil: PerfilPage,
}

// Loader propio de las secciones que traen datos. Tiene que llamar a requerirSeccion antes de pedirlos.
const loaders: Partial<Record<PanelSection, LoaderFunction>> = {
  siniestros: cargarSiniestros,
  aseguradoras: cargarAseguradoras,
  ajustadores: cargarAjustadores,
  usuarios: cargarUsuarios,
  perfil: cargarPerfil,
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
                path: 'siniestros/nuevo',
                loader: cargarAltaSiniestro,
                Component: AltaSiniestroPage,
              },
              {
                path: 'siniestros/:idSiniestro',
                loader: cargarFichaSiniestro,
                Component: FichaSiniestroPage,
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
