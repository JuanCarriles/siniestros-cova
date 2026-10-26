import { z } from 'zod'
import { plantillaListadoSchema, type AltaPlantillaData } from '@cova/shared/schemas/plantillas'
import { api } from '@/lib/api'

export async function listarPlantillas() {
  return z.array(plantillaListadoSchema).parse(await api('/plantillas'))
}
export async function subirPlantilla(datos: AltaPlantillaData, archivo: File) {
  const body = new FormData()
  body.set('encabezado', datos.encabezado)
  body.set('descripcion', datos.descripcion)
  body.set('archivo', archivo)
  return plantillaListadoSchema.parse(await api('/plantillas', { method: 'POST', body }))
}
export async function descargarPlantilla(id: number) {
  const { url } = await api<{ url: string }>(`/plantillas/${id}/descarga`)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.referrerPolicy = 'no-referrer'
  document.body.append(enlace)
  enlace.click()
  enlace.remove()
}
