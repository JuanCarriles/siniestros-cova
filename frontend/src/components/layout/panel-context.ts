import { useOutletContext } from 'react-router'
import type { PanelUser } from './panel-navigation'

export type PanelBase = { usuario: PanelUser; basePath: string }

/** Menú lateral de escritorio achicado a una franja de íconos (deja más ancho para tablas grandes). */
export type MenuLateral = { contraido: boolean; alternar: () => void }

export type PanelContext = PanelBase & { menuLateral: MenuLateral }

export function usePanel() {
  return useOutletContext<PanelContext>()
}
