import { Navigate, type RouteObject } from 'react-router'
import { PanelLayout } from '@/components/layout/panel-layout'
import { initialSection } from '@/components/layout/panel-navigation'
import { PanelPreviewHome } from '@/pages/panel-preview'
import { previews } from '@/pages/panel-preview-data'
import { PanelSectionPage } from '@/pages/panel-section'

// Este módulo se importa dinámicamente únicamente en DEV. No crea ni suplanta sesiones reales.
export const panelPreviewRoutes: RouteObject[] = [
  { path: '/vista-previa', Component: PanelPreviewHome },
  ...previews.map(({ slug, user }): RouteObject => {
    const basePath = `/vista-previa/${slug}`
    return {
      path: basePath,
      element: <PanelLayout usuario={user} basePath={basePath} />,
      children: [
        {
          index: true,
          element: <Navigate replace to={`${basePath}/${initialSection(user.tipo)}`} />,
        },
        { path: '*', Component: PanelSectionPage },
      ],
    }
  }),
]
