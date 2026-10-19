import { useLoaderData } from 'react-router'
import { PanelLayout } from '@/components/layout/panel-layout'
import type { cargarPanel } from '@/features/auth/sesion'

// Panel con el usuario de la sesión real. Las rutas quedan en la raíz: /siniestros, /dashboard, /perfil…
export function Panel() {
  const { usuario } = useLoaderData<typeof cargarPanel>()
  return (
    <PanelLayout
      usuario={{ nombre: `${usuario.nombres} ${usuario.apellidos}`, tipo: usuario.tipoUsuario }}
      basePath=""
    />
  )
}
