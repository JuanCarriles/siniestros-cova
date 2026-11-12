import type { Prisma } from '../../generated/prisma/client.ts'

/**
 * Mensajes del chat que el usuario todavía no leyó: los de otros, sin una lectura suya (E7-03). Los usa la marca de
 * leído y la cantidad que muestra la pestaña del chat en la ficha.
 */
export function mensajesSinLeerPor(idUsuario: number) {
  return {
    eliminado: false,
    idUsuario: { not: idUsuario },
    lecturas: { none: { idUsuario } },
  } satisfies Prisma.MensajeChatWhereInput
}

/** El contador se deriva de mensajes/lecturas; el aviso conserva la descripción de su última actualización. */
export function textoMensajesSinLeer(cantidad: number, numeroSiniestro: string) {
  return `Tenés ${cantidad} ${cantidad === 1 ? 'mensaje sin leer' : 'mensajes sin leer'} en el siniestro ${numeroSiniestro}.`
}
