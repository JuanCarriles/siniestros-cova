import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import type { Resolver } from 'react-hook-form'
import {
  editarCasoAdministradorSchema,
  editarCasoGestorSchema,
  type EditarCasoAdministrador,
  type EditarCasoGestor,
} from '@cova/shared/schemas/edicion-caso'

// País solo filtra provincias: se valida en el formulario y no se envía como un dato de la dirección.
const esquemaAdministrador = editarCasoAdministradorSchema
  .extend({ pais: z.string() })
  .refine((datos) => !datos.pais || datos.lugar.idProvincia, {
    path: ['lugar', 'idProvincia'],
    message: 'Elegí una provincia para guardar el país.',
  })
  .transform(({ pais: _pais, ...datos }) => datos)
const esquemaGestor = editarCasoGestorSchema
  .extend({ pais: z.string() })
  .refine((datos) => !datos.pais || datos.lugar.idProvincia, {
    path: ['lugar', 'idProvincia'],
    message: 'Elegí una provincia para guardar el país.',
  })
  .transform(({ pais: _pais, ...datos }) => datos)

export type ValoresEdicionCaso = z.input<typeof esquemaAdministrador>
export type PedidoEdicionCaso = EditarCasoAdministrador | EditarCasoGestor

// Ambos roles comparten los bloques visuales. Los campos protegidos se muestran al gestor, pero no se
// validan ni se envían: un dato histórico incompleto de la póliza no impide corregir hecho o lugar.
export function resolverEdicionCaso(
  administra: boolean,
): Resolver<ValoresEdicionCaso, unknown, PedidoEdicionCaso> {
  const administrador = zodResolver(esquemaAdministrador)
  const gestor = zodResolver(esquemaGestor)
  return (valores, contexto, opciones) =>
    administra
      ? administrador(valores, contexto, opciones)
      : gestor(
          {
            revision: valores.revision,
            pais: valores.pais,
            hecho: valores.hecho,
            lugar: valores.lugar,
          },
          contexto,
          { ...opciones, names: undefined },
        )
}
