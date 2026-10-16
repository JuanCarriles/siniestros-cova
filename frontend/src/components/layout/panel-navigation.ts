import type { TipoUsuario } from '@cova/shared/schemas/enums'

export type PanelSection =
  | 'dashboard'
  | 'siniestros'
  | 'plantillas'
  | 'aseguradoras'
  | 'ajustadores'
  | 'usuarios'
  | 'informes'
  | 'perfil'

export type PanelUser = { nombre: string; tipo: TipoUsuario }

export const roleLabels: Record<TipoUsuario, string> = {
  GESTOR: 'Gestor',
  ADMINISTRADOR: 'Administrador',
  SUPER_ADMINISTRADOR: 'Superadministrador',
}

export const sections: Record<PanelSection, { label: string; description: string }> = {
  dashboard: { label: 'Dashboard', description: 'Una mirada general al trabajo del estudio.' },
  siniestros: {
    label: 'Siniestros',
    description: 'El seguimiento de cada caso, en un mismo lugar.',
  },
  plantillas: {
    label: 'Plantillas',
    description: 'Modelos de documentos para acompañar tu trabajo.',
  },
  aseguradoras: {
    label: 'Aseguradoras',
    description: 'Las compañías con las que trabaja el estudio.',
  },
  ajustadores: { label: 'Ajustadores', description: 'Los profesionales que acompañan cada caso.' },
  usuarios: { label: 'Usuarios', description: 'Las personas que forman parte del equipo.' },
  informes: { label: 'Informes', description: 'Información para seguir la actividad del estudio.' },
  perfil: { label: 'Mi perfil', description: 'Tu identidad y tu espacio dentro del estudio.' },
}

const navigation: Record<TipoUsuario, readonly PanelSection[]> = {
  GESTOR: ['siniestros', 'plantillas'],
  ADMINISTRADOR: ['dashboard', 'siniestros', 'aseguradoras', 'ajustadores', 'usuarios', 'informes'],
  SUPER_ADMINISTRADOR: [
    'dashboard',
    'siniestros',
    'aseguradoras',
    'ajustadores',
    'usuarios',
    'informes',
  ],
}

// No se deducen permisos por orden de jerarquía. Cada rol tiene una lista explícita.
// Esta política controla la interfaz; las API deben autorizar cada operación con la sesión del servidor.
export function navigationFor(role: TipoUsuario): readonly PanelSection[] {
  return Object.hasOwn(navigation, role) ? navigation[role] : []
}

export function canOpenSection(role: TipoUsuario, section: string): section is PanelSection {
  if (!Object.hasOwn(navigation, role)) return false
  return section === 'perfil' || navigationFor(role).some((item) => item === section)
}

export function initialSection(role: TipoUsuario): PanelSection | null {
  return navigationFor(role)[0] ?? null
}
