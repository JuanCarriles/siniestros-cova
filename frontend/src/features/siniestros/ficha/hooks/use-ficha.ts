import { useLoaderData, useRouteLoaderData } from 'react-router'
import type { FichaSiniestro } from '@cova/shared/schemas/ficha-siniestro'
import type { pestanasFicha } from '../api/ficha.api'
import { RUTA_FICHA, type cargarFicha } from '../loader'

/** La cabecera y los datos del caso, desde cualquier pestaña */
export function useFicha(): FichaSiniestro {
  const datos = useRouteLoaderData<typeof cargarFicha>(RUTA_FICHA)
  if (!datos) throw new Error('useFicha se usa dentro de la ficha del siniestro')
  return datos.ficha
}

/** Lo que trajo cargarPestana(K) para la pestaña abierta */
export function usePestana<K extends keyof typeof pestanasFicha>() {
  return useLoaderData() as Awaited<ReturnType<(typeof pestanasFicha)[K]>>
}
