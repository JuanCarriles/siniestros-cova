import { data, type LoaderFunctionArgs } from 'react-router'
import { idSchema } from '@cova/shared/schemas/comunes'
import { requerirSeccion } from '@/features/auth/sesion'
import { ApiError } from '@/lib/api'
import { obtenerFicha, pestanasFicha } from './api/ficha.api'

/** Id de la ruta de la ficha: sus pestañas leen la cabecera con useRouteLoaderData */
export const RUTA_FICHA = 'ficha-siniestro'

// El servidor decide el acceso (E4-03, CU-10 1.j): un gestor que abre uno que no es suyo recibe 403 y ve el motivo
// en la pantalla de "no disponible", dentro del panel.
async function conAcceso<T>(pedido: () => Promise<T>): Promise<T> {
  try {
    return await pedido()
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
      throw data(err.message, { status: err.status })
    }
    throw err
  }
}

function idDe(args: LoaderFunctionArgs) {
  const id = idSchema.safeParse(args.params.idSiniestro)
  if (!id.success) throw data('El siniestro no existe.', { status: 404 })
  return id.data
}

// Cabecera y datos del caso. Al cambiar de pestaña no se vuelve a pedir (los parámetros no cambian).
export async function cargarFicha(args: LoaderFunctionArgs) {
  await requerirSeccion('siniestros')(args)
  const id = idDe(args)
  return { ficha: await conAcceso(() => obtenerFicha(id)) }
}

// Cada pestaña pide lo suyo al abrirse; corre en paralelo con el de la cabecera
export function cargarPestana(pestana: keyof typeof pestanasFicha) {
  return async (args: LoaderFunctionArgs) => {
    await requerirSeccion('siniestros')(args)
    const id = idDe(args)
    return conAcceso<unknown>(() => pestanasFicha[pestana](id))
  }
}
