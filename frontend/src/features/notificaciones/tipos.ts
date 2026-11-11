import {
  ArrowLeftRight,
  Bell,
  ClipboardCheck,
  FilePlus2,
  MessageSquare,
  Megaphone,
  Timer,
  TriangleAlert,
  UserRoundPlus,
} from 'lucide-react'
import type { TipoNotificacion } from '@cova/shared/schemas/enums'

export const tiposNotificacion = {
  ASIGNACION_SINIESTRO: {
    pestana: '',
    etiqueta: 'Asignación de siniestro',
    icono: UserRoundPlus,
    color: 'bg-info-bg text-info-ink',
  },
  REASIGNACION_SINIESTRO: {
    pestana: '',
    etiqueta: 'Reasignación de siniestro',
    icono: ArrowLeftRight,
    color: 'bg-info-bg text-info-ink',
  },
  MENSAJE_NUEVO: {
    pestana: 'chat',
    etiqueta: 'Mensaje de chat',
    icono: MessageSquare,
    color: 'bg-info-bg text-info-ink',
  },
  NOVEDAD_CARGADA: {
    pestana: 'novedades',
    etiqueta: 'Novedad',
    icono: Megaphone,
    color: 'bg-warning-bg text-warning-ink',
  },
  CAMBIO_ESTADO: {
    pestana: 'historial',
    etiqueta: 'Cambio de estado',
    icono: ClipboardCheck,
    color: 'bg-ok-bg text-ok-ink',
  },
  DOCUMENTO_NUEVO: {
    pestana: 'documentos',
    etiqueta: 'Documento nuevo',
    icono: FilePlus2,
    color: 'bg-info-bg text-info-ink',
  },
  CASO_DEMORADO: {
    pestana: '',
    etiqueta: 'Caso demorado',
    icono: Timer,
    color: 'bg-warning-bg text-warning-ink',
  },
  CASO_EN_ALERTA: {
    pestana: '',
    etiqueta: 'Caso en alerta',
    icono: TriangleAlert,
    color: 'bg-danger-bg text-danger-ink',
  },
} satisfies Record<
  TipoNotificacion,
  { etiqueta: string; icono: typeof Bell; color: string; pestana: string }
>

export function destinoNotificacion(basePath: string, tipo: TipoNotificacion, idSiniestro: number) {
  const pestana = tiposNotificacion[tipo].pestana
  return `${basePath}/siniestros/${idSiniestro}${pestana ? `/${pestana}` : ''}`
}
