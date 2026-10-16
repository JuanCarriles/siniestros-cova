import { useOutletContext } from 'react-router'
import type { PanelUser } from './panel-navigation'

export type PanelContext = { usuario: PanelUser; basePath: string }

export function usePanel() {
  return useOutletContext<PanelContext>()
}
