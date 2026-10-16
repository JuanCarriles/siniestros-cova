import {
  Building2,
  ChartNoAxesCombined,
  FileStack,
  FolderOpen,
  LayoutDashboard,
  UserRound,
  UsersRound,
  UserRoundCheck,
} from 'lucide-react'
import type { PanelSection } from './panel-navigation'

export const sectionIcons = {
  dashboard: LayoutDashboard,
  siniestros: FolderOpen,
  plantillas: FileStack,
  aseguradoras: Building2,
  ajustadores: UserRoundCheck,
  usuarios: UsersRound,
  informes: ChartNoAxesCombined,
  perfil: UserRound,
} satisfies Record<PanelSection, typeof FolderOpen>
