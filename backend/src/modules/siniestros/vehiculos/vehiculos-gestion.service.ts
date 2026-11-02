import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type { ParteCreada, VehiculoConPersonas } from '@cova/shared/schemas/partes-siniestro'
import type { VehiculoAltaData } from '@cova/shared/schemas/siniestros-alta'
import { HttpError } from '../../../utils/httpError.ts'
import { eventoHistorial } from '../../historial/historial.textos.ts'
import { datosVehiculo } from '../partes-datos.ts'
import {
  camposCambiados,
  exigirCatalogos,
  exigirDominioLibre,
  prepararEdicion,
  type Transaccion,
  type Tx,
} from '../partes-edicion.ts'

/** Cómo se nombra cada dato en el historial cuando cambia */
const ETIQUETAS: Record<keyof ReturnType<typeof datosVehiculo>, string> = {
  rolAccidente: 'rol en el accidente',
  dominio: 'dominio',
  marca: 'marca',
  modelo: 'modelo',
  version: 'versión',
  anio: 'año',
  uso: 'uso',
  tipo: 'tipo',
  color: 'color',
  numeroChasis: 'número de chasis',
  numeroMotor: 'número de motor',
  idAseguradora: 'aseguradora',
  acreedorPrendario: 'acreedor prendario',
  descripcionDanos: 'daños',
}

async function buscarVehiculo(tx: Tx, idSiniestro: number, idVehiculo: number) {
  const vehiculo = await tx.vehiculo.findFirst({
    where: { id: idVehiculo, idSiniestro, eliminado: false },
  })
  if (!vehiculo)
    throw new HttpError(404, 'Ese vehículo ya no está en el siniestro. Actualizá la página.')
  return vehiculo
}

// CU-10 1.c.1, 1.c.5 y 1.c.6 (E5-06): vehículos desde la ficha, con las mismas reglas del alta. Cada cambio queda en
// el historial; no cuenta como movimiento del caso (no toca fechaUltimoMovimiento).
export function crearServicioVehiculosGestion({ transaccion }: { transaccion: Transaccion }) {
  return {
    async agregar(
      usuario: SesionUsuario,
      idSiniestro: number,
      datos: VehiculoAltaData,
    ): Promise<ParteCreada> {
      return transaccion(async (tx) => {
        const autor = await prepararEdicion(tx, usuario, idSiniestro)
        await exigirDominioLibre(tx, idSiniestro, datos.dominio)
        await exigirCatalogos(tx, { idAseguradora: datos.idAseguradora })
        const { id } = await tx.vehiculo.create({
          data: { idSiniestro, ...datosVehiculo(datos) },
          select: { id: true },
        })
        await tx.historialSiniestro.create({
          data: {
            idSiniestro,
            idUsuario: usuario.id,
            ...eventoHistorial.vehiculoAgregado(autor, datos.dominio, new Date()),
          },
        })
        return { id }
      })
    },

    async modificar(
      usuario: SesionUsuario,
      idSiniestro: number,
      idVehiculo: number,
      datos: VehiculoAltaData,
    ) {
      await transaccion(async (tx) => {
        const autor = await prepararEdicion(tx, usuario, idSiniestro)
        const actual = await buscarVehiculo(tx, idSiniestro, idVehiculo)
        const nuevos = datosVehiculo(datos)
        const campos = camposCambiados(actual, nuevos, ETIQUETAS)
        if (campos.length === 0) return
        if (nuevos.dominio !== actual.dominio)
          await exigirDominioLibre(tx, idSiniestro, nuevos.dominio, idVehiculo)
        if (nuevos.idAseguradora !== actual.idAseguradora)
          await exigirCatalogos(tx, { idAseguradora: nuevos.idAseguradora })
        await tx.vehiculo.update({ where: { id: idVehiculo }, data: nuevos })
        await tx.historialSiniestro.create({
          data: {
            idSiniestro,
            idUsuario: usuario.id,
            // Con el dominio de antes: si cambió, el historial dice cuál era el vehículo
            ...eventoHistorial.vehiculoModificado(autor, actual.dominio, campos, new Date()),
          },
        })
      })
    },

    // 1.c.6.1: con titular u ocupantes activos no se da de baja; se dice a quiénes dar de baja primero
    async darDeBaja(usuario: SesionUsuario, idSiniestro: number, idVehiculo: number) {
      await transaccion(async (tx) => {
        const autor = await prepararEdicion(tx, usuario, idSiniestro)
        const actual = await buscarVehiculo(tx, idSiniestro, idVehiculo)
        const personas = await tx.personaInvolucrada.findMany({
          where: { idVehiculo, eliminado: false },
          orderBy: { id: 'asc' },
          select: { id: true, nombreCompletoRazonSocial: true, esPropietario: true },
        })
        if (personas.length) {
          const detalle: VehiculoConPersonas = {
            codigo: 'VEHICULO_CON_PERSONAS',
            personas: personas.map((p) => ({
              id: p.id,
              nombre: p.nombreCompletoRazonSocial?.trim() || null,
              rol: p.esPropietario ? 'titular' : 'ocupante',
            })),
          }
          throw new HttpError(
            409,
            `El vehículo ${actual.dominio} tiene ${personas.length === 1 ? 'una persona cargada. Dala' : `${personas.length} personas cargadas. Dalas`} de baja antes de dar de baja el vehículo.`,
            detalle,
          )
        }
        await tx.vehiculo.update({
          where: { id: idVehiculo },
          data: { eliminado: true, fechaBaja: new Date() },
        })
        await tx.historialSiniestro.create({
          data: {
            idSiniestro,
            idUsuario: usuario.id,
            ...eventoHistorial.vehiculoDadoDeBaja(autor, actual.dominio, new Date()),
          },
        })
      })
    },
  }
}
