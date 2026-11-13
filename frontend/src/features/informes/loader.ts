import type { LoaderFunctionArgs } from 'react-router'
import { listadoInformesSchema } from '@cova/shared/schemas/informes'
import { requerirSeccion } from '@/features/auth/sesion'
import { api } from '@/lib/api'
export async function cargarInformes(args: LoaderFunctionArgs) {
  await requerirSeccion('informes')(args)
  const p = new URL(args.request.url).searchParams.get('pagina') ?? '1'
  return listadoInformesSchema.parse(
    await api(`/informes?pagina=${encodeURIComponent(p)}`, { signal: args.request.signal }),
  )
}
