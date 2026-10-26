import type { LoaderFunctionArgs } from 'react-router'
import { requerirSeccion } from '@/features/auth/sesion'
import { listarPlantillas } from './plantillas.api'

export async function cargarPlantillas(args: LoaderFunctionArgs) {
  await requerirSeccion('plantillas')(args)
  return { plantillas: await listarPlantillas() }
}
