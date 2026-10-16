import { BriefcaseBusiness, ShieldCheck, UserRound } from 'lucide-react'
import type { PanelUser } from '@/components/layout/panel-navigation'

export const previews: {
  slug: string
  user: PanelUser
  description: string
  icon: typeof UserRound
}[] = [
  {
    slug: 'administrador',
    user: { nombre: 'Administrador de ejemplo', tipo: 'ADMINISTRADOR' },
    description: 'Dashboard y navegación de administración del estudio.',
    icon: BriefcaseBusiness,
  },
  {
    slug: 'super-administrador',
    user: { nombre: 'Superadministrador de ejemplo', tipo: 'SUPER_ADMINISTRADOR' },
    description: 'La misma estructura administrativa, identificada con su rol.',
    icon: ShieldCheck,
  },
  {
    slug: 'gestor',
    user: { nombre: 'Gestor de ejemplo', tipo: 'GESTOR' },
    description: 'Siniestros, plantillas para descargar y perfil personal.',
    icon: UserRound,
  },
]
