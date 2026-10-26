import type { DatosCasoData, OpcionesAltaSiniestro } from '@cova/shared/schemas/siniestros-alta'
import type { Prisma } from '../../generated/prisma/client.ts'
import { HttpError } from '../../utils/httpError.ts'

type BaseAlta = Pick<
  Prisma.TransactionClient,
  'siniestro' | 'aseguradora' | 'ajustador' | 'pais' | 'provincia'
>

// Mismo criterio que el listado y las bajas: no dado de baja y en un estado que no es de cierre.
const siniestroActivo = {
  eliminado: false,
  estadoSiniestro: { esCierre: false },
} satisfies Prisma.SiniestroWhereInput

// CU-09 alta de siniestro (E4-04). El borrador vive en el navegador hasta confirmar el último paso; el servidor
// da las opciones de cada paso y valida lo cargado antes de avanzar.
export function crearServicioAltaSiniestros(prisma: BaseAlta) {
  return {
    async opciones(): Promise<OpcionesAltaSiniestro> {
      const [aseguradoras, ajustadores, paises, provincias] = await Promise.all([
        prisma.aseguradora.findMany({
          where: { eliminado: false },
          select: { id: true, nombre: true },
          orderBy: { nombre: 'asc' },
        }),
        prisma.ajustador.findMany({
          where: { eliminado: false, aseguradora: { eliminado: false } },
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            idAseguradora: true,
            _count: { select: { siniestros: { where: siniestroActivo } } },
          },
          orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }],
        }),
        prisma.pais.findMany({
          where: { eliminado: false },
          select: { id: true, nombre: true },
          orderBy: { nombre: 'asc' },
        }),
        prisma.provincia.findMany({
          where: { eliminado: false, pais: { eliminado: false } },
          select: { id: true, nombre: true, idPais: true },
          orderBy: { nombre: 'asc' },
        }),
      ])
      return {
        aseguradoras,
        ajustadores: ajustadores.map(({ _count, nombres, apellidos, ...a }) => ({
          ...a,
          nombre: `${nombres} ${apellidos}`,
          casosActivos: _count.siniestros,
        })),
        paises,
        provincias,
      }
    },

    // Paso 1 (CU-09 5.a y 5.b). El formato ya lo validó el schema; acá, lo que depende de la base. Cada error
    // indica su campo para que el formulario lo marque y conserve el resto de lo cargado.
    async validarDatosCaso(datos: DatosCasoData) {
      const aseguradora = await prisma.aseguradora.findFirst({
        where: { id: datos.idAseguradora, eliminado: false },
        select: { id: true },
      })
      if (!aseguradora)
        throw new HttpError(400, 'La aseguradora elegida ya no está disponible. Elegí otra.', {
          campo: 'idAseguradora',
        })

      // Un dado de baja también cuenta: sigue existiendo y se puede volver a ver. Sin distinguir mayúsculas.
      const duplicado = await prisma.siniestro.findFirst({
        where: {
          idAseguradora: datos.idAseguradora,
          numeroSiniestro: { equals: datos.numeroSiniestro, mode: 'insensitive' },
        },
        select: { eliminado: true },
      })
      if (duplicado)
        throw new HttpError(
          409,
          duplicado.eliminado
            ? 'Ya existe un siniestro dado de baja con este número para esta aseguradora. Revisá el número o consultalo con "Mostrar dados de baja".'
            : 'Ya existe un siniestro con este número para esta aseguradora. Revisá el número.',
          { campo: 'numeroSiniestro' },
        )

      if (datos.idAjustador) {
        const ajustador = await prisma.ajustador.findFirst({
          where: { id: datos.idAjustador, eliminado: false, idAseguradora: datos.idAseguradora },
          select: { id: true },
        })
        if (!ajustador)
          throw new HttpError(
            400,
            'El ajustador elegido no está disponible para esta aseguradora. Elegí otro.',
            { campo: 'idAjustador' },
          )
      }

      if (datos.lugar.idProvincia) {
        const provincia = await prisma.provincia.findFirst({
          where: { id: datos.lugar.idProvincia, eliminado: false, pais: { eliminado: false } },
          select: { id: true },
        })
        if (!provincia)
          throw new HttpError(400, 'La provincia elegida ya no está disponible. Elegí otra.', {
            campo: 'lugar.idProvincia',
          })
      }
    },
  }
}
