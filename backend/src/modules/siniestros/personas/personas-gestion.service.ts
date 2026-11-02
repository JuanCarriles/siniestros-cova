import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type { AgregarPersona, ParteCreada } from '@cova/shared/schemas/partes-siniestro'
import {
  ocupanteAltaSchema,
  personaExternaAltaSchema,
  titularAltaSchema,
} from '@cova/shared/schemas/siniestros-alta'
import { usosDeDireccion } from '../../../lib/direcciones.ts'
import { HttpError } from '../../../utils/httpError.ts'
import { eventoHistorial } from '../../historial/historial.textos.ts'
import { datosDireccion, datosPersona, type TipoPersona } from '../partes-datos.ts'
import {
  camposCambiados,
  exigirCatalogos,
  exigirDocumentoLibre,
  exigirRevision,
  nombreParaHistorial,
  prepararEdicion,
  rolParaHistorial,
  type Transaccion,
  type Tx,
} from '../partes-edicion.ts'

const ESQUEMAS = {
  titular: titularAltaSchema,
  ocupante: ocupanteAltaSchema,
  externa: personaExternaAltaSchema,
}

/** Cómo se nombra cada dato en el historial cuando cambia */
const ETIQUETAS: Record<keyof ReturnType<typeof datosPersona>, string> = {
  nombreCompletoRazonSocial: 'nombre',
  idTipoDocumento: 'documento',
  documento: 'documento',
  estadoCivil: 'estado civil',
  sexo: 'sexo',
  fechaNacimiento: 'fecha de nacimiento',
  telefono: 'teléfono',
  email: 'email',
  esPropietario: 'rol',
  esOcupante: 'si iba en el vehículo',
  rolEnVehiculo: 'lugar en el vehículo',
  relacionPropietario: 'relación con el titular',
  numeroPermisoConducir: 'permiso de conducir',
  fechaVencimientoCarnet: 'vencimiento del carnet',
  rolSinVehiculo: 'rol en el siniestro',
  tipoLesion: 'lesiones',
  descripcionLesiones: 'lesiones',
}
const ETIQUETAS_DOMICILIO = {
  idProvincia: 'domicilio',
  localidad: 'domicilio',
  calle: 'domicilio',
  codigoPostal: 'domicilio',
}

/** Un vehículo activo del siniestro, para cargarle una persona */
async function vehiculoDelSiniestro(tx: Tx, idSiniestro: number, idVehiculo: number) {
  const vehiculo = await tx.vehiculo.findFirst({
    where: { id: idVehiculo, idSiniestro, eliminado: false },
    select: { id: true, dominio: true },
  })
  if (!vehiculo)
    throw new HttpError(404, 'Ese vehículo ya no está en el siniestro. Actualizá la página.')
  return vehiculo
}

async function buscarPersona(tx: Tx, idSiniestro: number, idPersona: number) {
  const persona = await tx.personaInvolucrada.findFirst({
    where: { id: idPersona, idSiniestro, eliminado: false },
    include: {
      direccion: true,
      vehiculo: { select: { dominio: true } },
    },
  })
  if (!persona)
    throw new HttpError(404, 'Esa persona ya no está en el siniestro. Actualizá la página.')
  const tipo: TipoPersona =
    persona.idVehiculo === null ? 'externa' : persona.esPropietario ? 'titular' : 'ocupante'
  return { persona, tipo }
}

/**
 * El domicilio se corrige en su misma fila; si no tenía y ahora tiene, se crea. Si la fila la usa también otro
 * registro (un usuario, el lugar de un siniestro, un perito), no se toca: la persona pasa a tener una copia propia.
 * Devuelve la dirección que queda en la persona.
 */
async function guardarDomicilio(
  tx: Tx,
  idDireccion: number | null,
  domicilio: ReturnType<typeof datosDireccion>,
): Promise<number | null> {
  const nueva = async () =>
    domicilio ? (await tx.direccion.create({ data: domicilio, select: { id: true } })).id : null
  if (!idDireccion) return nueva()
  const usos = await usosDeDireccion(tx, idDireccion)
  if (usos.usuarios > 0 || usos.siniestros > 0 || usos.perito) return nueva()
  await tx.direccion.update({
    where: { id: idDireccion },
    data: domicilio ?? { idProvincia: null, localidad: null, calle: null, codigoPostal: null },
  })
  return idDireccion
}

// CU-10 1.c.2 a 1.c.6 (E5-06): titulares, ocupantes y personas fuera de los vehículos desde la ficha, con las
// mismas reglas del alta. Cada cambio queda en el historial; no cuenta como movimiento del caso.
export function crearServicioPersonasGestion({ transaccion }: { transaccion: Transaccion }) {
  return {
    async agregar(
      usuario: SesionUsuario,
      idSiniestro: number,
      pedido: AgregarPersona,
    ): Promise<ParteCreada> {
      return transaccion(async (tx) => {
        const autor = await prepararEdicion(tx, usuario, idSiniestro)
        let vehiculo: { id: number; dominio: string } | null = null
        if (pedido.tipo !== 'externa') {
          vehiculo = await vehiculoDelSiniestro(tx, idSiniestro, pedido.idVehiculo)
          if (
            pedido.tipo === 'titular' &&
            (await tx.personaInvolucrada.count({
              where: { idVehiculo: vehiculo.id, esPropietario: true, eliminado: false },
            }))
          )
            throw new HttpError(
              409,
              `El vehículo ${vehiculo.dominio} ya tiene titular. Modificalo o dalo de baja primero.`,
            )
        }
        const { datos } = pedido
        await exigirDocumentoLibre(tx, idSiniestro, datos.documento)
        await exigirCatalogos(tx, {
          idTipoDocumento: datos.idTipoDocumento,
          idProvincia: datos.domicilio.idProvincia,
        })
        const domicilio = datosDireccion(datos.domicilio)
        const { id } = await tx.personaInvolucrada.create({
          data: {
            idSiniestro,
            idVehiculo: vehiculo?.id ?? null,
            ...datosPersona(pedido.tipo, datos),
            idDireccion: domicilio
              ? (await tx.direccion.create({ data: domicilio, select: { id: true } })).id
              : null,
          },
          select: { id: true },
        })
        await tx.historialSiniestro.create({
          data: {
            idSiniestro,
            idUsuario: usuario.id,
            ...eventoHistorial.personaAgregada(
              autor,
              nombreParaHistorial(datos.nombreCompletoRazonSocial ?? null),
              rolParaHistorial(
                pedido.tipo,
                vehiculo?.dominio ?? null,
                pedido.tipo === 'externa' ? pedido.datos.rolSinVehiculo : null,
              ),
              new Date(),
            ),
          },
        })
        return { id }
      })
    },

    /** Los datos llegan sin validar: el formulario depende de si es titular, ocupante o persona fuera */
    async modificar(
      usuario: SesionUsuario,
      idSiniestro: number,
      idPersona: number,
      { revision, datos: cuerpo }: { revision: number; datos: unknown },
    ) {
      await transaccion(async (tx) => {
        const autor = await prepararEdicion(tx, usuario, idSiniestro)
        const { persona, tipo } = await buscarPersona(tx, idSiniestro, idPersona)
        const datos = ESQUEMAS[tipo].parse(cuerpo)
        const nuevos = datosPersona(tipo, datos)
        const domicilio = datosDireccion(datos.domicilio)
        const campos = [
          ...new Set([
            ...camposCambiados(persona, nuevos, ETIQUETAS),
            ...camposCambiados(persona.direccion ?? {}, domicilio ?? {}, ETIQUETAS_DOMICILIO),
          ]),
        ]
        // Sin diferencias con lo guardado no pisa nada, aunque el formulario sea viejo
        if (campos.length === 0) return
        exigirRevision(
          persona.revision,
          revision,
          `los datos de ${nombreParaHistorial(persona.nombreCompletoRazonSocial)}`,
        )
        if (nuevos.documento !== persona.documento)
          await exigirDocumentoLibre(tx, idSiniestro, nuevos.documento, idPersona)
        await exigirCatalogos(tx, {
          idTipoDocumento:
            nuevos.idTipoDocumento !== persona.idTipoDocumento ? nuevos.idTipoDocumento : null,
          idProvincia:
            (domicilio?.idProvincia ?? null) !== (persona.direccion?.idProvincia ?? null)
              ? domicilio?.idProvincia
              : null,
        })
        const idDireccion = await guardarDomicilio(tx, persona.idDireccion, domicilio)
        await tx.personaInvolucrada.update({
          where: { id: idPersona },
          data: { ...nuevos, idDireccion, revision: { increment: 1 } },
        })
        await tx.historialSiniestro.create({
          data: {
            idSiniestro,
            idUsuario: usuario.id,
            // Con el nombre y el rol de antes: si cambiaron, el historial dice de quién era el dato
            ...eventoHistorial.personaModificada(
              autor,
              nombreParaHistorial(persona.nombreCompletoRazonSocial),
              rolParaHistorial(tipo, persona.vehiculo?.dominio ?? null, persona.rolSinVehiculo),
              campos,
              new Date(),
            ),
          },
        })
      })
    },

    // El abogado que la representaba no se toca: si no le queda nadie activo, deja de verse en la ficha
    async darDeBaja(usuario: SesionUsuario, idSiniestro: number, idPersona: number) {
      await transaccion(async (tx) => {
        const autor = await prepararEdicion(tx, usuario, idSiniestro)
        const { persona, tipo } = await buscarPersona(tx, idSiniestro, idPersona)
        await tx.personaInvolucrada.update({
          where: { id: idPersona },
          data: { eliminado: true, fechaBaja: new Date() },
        })
        await tx.historialSiniestro.create({
          data: {
            idSiniestro,
            idUsuario: usuario.id,
            ...eventoHistorial.personaDadaDeBaja(
              autor,
              nombreParaHistorial(persona.nombreCompletoRazonSocial),
              rolParaHistorial(tipo, persona.vehiculo?.dominio ?? null, persona.rolSinVehiculo),
              new Date(),
            ),
          },
        })
      })
    },
  }
}
