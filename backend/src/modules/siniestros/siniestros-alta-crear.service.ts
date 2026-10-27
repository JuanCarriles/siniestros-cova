import {
  type CrearSiniestroData,
  type DocumentoAlta,
  type OcupanteAltaData,
  type PersonaExternaAltaData,
  type SiniestroCreado,
  type TitularAltaData,
} from '@cova/shared/schemas/siniestros-alta'
import { TipoNotificacion, type Prisma } from '../../generated/prisma/client.ts'
import type { AvisoAsignacion } from '../../lib/correo-asignacion.ts'
import { motivoFalloCorreo } from '../../lib/correo-resend.ts'
import type { AlmacenamientoR2, ArchivoEntrada } from '../../lib/r2.ts'
import { HttpError } from '../../utils/httpError.ts'
import { nombreCompleto } from '../../utils/formato.ts'
import { eventoHistorial } from '../historial/historial.textos.ts'
import { validarArchivoPlantilla } from '../plantillas/validar-archivo.ts'

type Actor = { id: number }
type Persona = TitularAltaData | OcupanteAltaData | PersonaExternaAltaData

// Las fechas sin hora (AAAA-MM-DD) van a columnas Date; las de los peritos, a Timestamptz: al mediodía de la
// Argentina, para que ningún huso las corra de día.
const dia = (fecha: string) => new Date(`${fecha}T00:00:00Z`)
const diaArgentina = (fecha: string) => new Date(`${fecha}T12:00:00-03:00`)
const horaDelDia = (hora: string) => new Date(`1970-01-01T${hora}Z`)

const carpetaDe = (actor: Actor) => `altas/${actor.id}`

// CU-09 pasos 32-36 (E4-10). Los documentos se suben a R2 a medida que se eligen, a la carpeta del alta de quien
// la carga (todavía no hay siniestro); al confirmar se crea todo en una sola transacción, los documentos pasan a la
// carpeta del siniestro y se avisa al asignado. altas/ es temporal: una regla de R2 borra lo que tenga más de 30
// días (altas abandonadas), ver DEPLOY.md.
export function crearServicioCrearSiniestro(deps: {
  transaccion: <T>(trabajo: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>
  almacenamiento: () => AlmacenamientoR2
  enviarAvisoAsignacion: (aviso: AvisoAsignacion) => Promise<void>
  /** Dirección del sistema, para el enlace del mail */
  urlSistema: string
}) {
  const { transaccion, almacenamiento, enviarAvisoAsignacion, urlSistema } = deps

  // Los documentos del alta pasan a siniestros/{id}, donde se cargan los que se suban después. Copiar, registrar la
  // clave nueva y recién entonces borrar el original: si algo falla, el documento sigue apuntando a un archivo que
  // existe. Lo que quede en altas/ lo borra la regla de 30 días.
  async function moverAlSiniestro(
    idSiniestro: number,
    documentos: { id: number; clave: string }[],
  ) {
    for (const d of documentos) {
      let nueva: string
      try {
        nueva = await almacenamiento().copiar(d.clave, `siniestros/${idSiniestro}`)
      } catch {
        console.error(`Documento ${d.id} sin mover: sigue en ${d.clave}`)
        continue
      }
      try {
        await transaccion((tx) =>
          tx.documentoSiniestro.update({
            where: { id: d.id },
            data: { urlArchivoSinDominio: nueva },
          }),
        )
      } catch {
        console.error(`Documento ${d.id} sin mover: sigue en ${d.clave}`)
        await almacenamiento()
          .eliminar(nueva)
          .catch(() => console.error(`Copia sobrante en R2: ${nueva}`))
        continue
      }
      await almacenamiento()
        .eliminar(d.clave)
        .catch(() =>
          console.error(`Original sobrante en R2 (lo borra la regla de altas/): ${d.clave}`),
        )
    }
  }

  // Un documento del alta es de quien lo subió: nadie puede asociar ni borrar los de otro
  function comprobarPropio(actor: Actor, clave: string) {
    if (!clave.startsWith(`${carpetaDe(actor)}/`))
      throw new HttpError(403, 'Ese documento no pertenece a tu alta.')
  }

  return {
    /** Pasos 33-34: mismos formatos y tamaño que las plantillas (33.a, 33.b); si R2 falla, se reintenta (34.a). */
    async subirDocumento(actor: Actor, archivo: ArchivoEntrada): Promise<DocumentoAlta> {
      await validarArchivoPlantilla(archivo)
      try {
        const objeto = await almacenamiento().subir(archivo, carpetaDe(actor))
        return {
          clave: objeto.clave,
          nombreOriginal: objeto.nombreOriginal,
          tipoExtension: objeto.tipoExtension,
          mimeType: objeto.mimeType,
          tamanoBytes: Number(objeto.tamanoBytes),
        }
      } catch (error) {
        if (error instanceof HttpError && error.status < 500) throw error
        throw new HttpError(
          503,
          'No se pudo guardar el documento. Probá de nuevo o seguí sin cargarlo: lo demás del alta no se pierde.',
        )
      }
    },

    /** Quitar un documento del alta (o descartarla): se borra de R2 si todavía no es de un siniestro. */
    async quitarDocumento(actor: Actor, clave: string) {
      comprobarPropio(actor, clave)
      const enUso = await transaccion((tx) =>
        tx.documentoSiniestro.findFirst({
          where: { urlArchivoSinDominio: clave },
          select: { id: true },
        }),
      )
      if (enUso) return
      await almacenamiento().eliminar(clave)
    },

    /** alta: ya validada con crearSiniestroSchema */
    async crear(actor: Actor, alta: CrearSiniestroData): Promise<SiniestroCreado> {
      for (const d of alta.documentos) comprobarPropio(actor, d.clave)
      const { datosCaso: caso } = alta

      const creado = await transaccion(async (tx) => {
        const error = (status: number, mensaje: string, campo?: string) =>
          new HttpError(status, mensaje, campo ? { campo } : undefined)

        // Lo que depende de la base se vuelve a comprobar: pudo cambiar mientras se cargaba el alta
        const autor = await tx.usuario.findFirst({
          where: { id: actor.id, eliminado: false },
          select: { nombres: true, apellidos: true },
        })
        if (!autor) throw error(401, 'Tu sesión venció. Volvé a ingresar.')
        const aseguradora = await tx.aseguradora.findFirst({
          where: { id: caso.idAseguradora, eliminado: false },
          select: { nombre: true },
        })
        if (!aseguradora)
          throw error(
            400,
            'La aseguradora elegida ya no está disponible. Elegila de nuevo en el paso 1.',
          )
        // Pudo haberse cargado el mismo número desde otra pestaña o por otro usuario (CU-09 5.b)
        const duplicado = await tx.siniestro.findFirst({
          where: {
            idAseguradora: caso.idAseguradora,
            numeroSiniestro: { equals: caso.numeroSiniestro, mode: 'insensitive' },
          },
          select: { id: true },
        })
        if (duplicado)
          throw error(
            409,
            'Ya existe un siniestro con este número para esta aseguradora. Corregilo en el paso 1.',
            'numeroSiniestro',
          )
        if (
          caso.idAjustador &&
          !(await tx.ajustador.findFirst({
            where: { id: caso.idAjustador, eliminado: false, idAseguradora: caso.idAseguradora },
            select: { id: true },
          }))
        )
          throw error(400, 'El ajustador elegido ya no está disponible. Elegí otro en el paso 1.')

        const asignado = await tx.usuario.findFirst({
          where: { id: alta.idUsuarioAsignado, eliminado: false },
          select: { id: true, nombres: true, apellidos: true, email: true },
        })
        if (!asignado)
          throw error(
            400,
            'El usuario elegido ya no está disponible. Elegí a quién asignar el siniestro.',
            'idUsuarioAsignado',
          )

        // Un archivo del alta se registra una sola vez (por ejemplo, si el alta se manda dos veces)
        if (
          alta.documentos.length &&
          (await tx.documentoSiniestro.count({
            where: { urlArchivoSinDominio: { in: alta.documentos.map((d) => d.clave) } },
          }))
        )
          throw error(409, 'Un documento de esta alta ya pertenece a un siniestro creado.')

        // El primer estado abierto del catálogo: "En tratamiento"
        const estado = await tx.estadoSiniestro.findFirst({
          where: { eliminado: false, esCierre: false },
          orderBy: { id: 'asc' },
          select: { id: true },
        })
        if (!estado) throw error(503, 'No hay estados de siniestro cargados en el sistema.')

        const personasVehiculos = alta.vehiculos.flatMap((v) => [
          ...(v.titular ? [v.titular] : []),
          ...v.ocupantes,
        ])
        const personas = [...personasVehiculos, ...alta.personasExternas]
        const provincias = new Set(
          [caso.lugar.idProvincia, ...personas.map((p) => p.datos.domicilio.idProvincia)].filter(
            (id): id is number => !!id,
          ),
        )
        const tiposDocumento = new Set(
          personas.map((p) => p.datos.idTipoDocumento).filter((id): id is number => !!id),
        )
        const aseguradorasVehiculos = new Set(
          alta.vehiculos.map((v) => v.datos.idAseguradora).filter((id): id is number => !!id),
        )
        // Cada id elegido tiene que seguir activo en su catálogo
        const activos = (ids: Set<number>) => ({ id: { in: [...ids] }, eliminado: false })
        if ((await tx.provincia.count({ where: activos(provincias) })) !== provincias.size)
          throw error(400, 'Una provincia elegida ya no está disponible. Revisá los domicilios.')
        if (
          (await tx.tipoDocumento.count({ where: activos(tiposDocumento) })) !== tiposDocumento.size
        )
          throw error(400, 'Un tipo de documento elegido ya no está disponible.')
        if (
          (await tx.aseguradora.count({ where: activos(aseguradorasVehiculos) })) !==
          aseguradorasVehiculos.size
        )
          throw error(400, 'La aseguradora de un vehículo ya no está disponible.')

        const ahora = new Date()
        const direccion = async (d: {
          idProvincia?: number | null
          localidad?: string | null
          calle?: string | null
          codigoPostal?: string | null
        }) =>
          d.idProvincia || d.localidad || d.calle || d.codigoPostal
            ? (
                await tx.direccion.create({
                  data: {
                    idProvincia: d.idProvincia ?? null,
                    localidad: d.localidad ?? null,
                    calle: d.calle ?? null,
                    codigoPostal: d.codigoPostal ?? null,
                  },
                  select: { id: true },
                })
              ).id
            : null

        const siniestro = await tx.siniestro.create({
          data: {
            numeroSiniestro: caso.numeroSiniestro,
            numeroPoliza: caso.numeroPoliza,
            inicioVigencia: caso.inicioVigencia ?? null,
            sucursal: caso.sucursal,
            causa: caso.causa ?? null,
            menorEdadInvolucrado: caso.menorEdadInvolucrado,
            fechaOcurrencia: caso.fechaOcurrencia ? dia(caso.fechaOcurrencia) : null,
            horaOcurrencia: caso.horaOcurrencia ? horaDelDia(caso.horaOcurrencia) : null,
            idAseguradora: caso.idAseguradora,
            idAjustador: caso.idAjustador ?? null,
            idDireccion: await direccion(caso.lugar),
            idEstadoSiniestro: estado.id,
            idUsuario: asignado.id,
            fechaAsignacion: ahora,
            fechaUltimoMovimiento: ahora,
            demorado: false,
          },
          select: { id: true, numeroSiniestro: true },
        })
        const idSiniestro = siniestro.id

        // Abogados primero: cada persona guarda el suyo (a lo sumo uno)
        const abogadoDe = new Map<string, number>()
        for (const a of alta.abogados) {
          const { id } = await tx.abogado.create({
            data: {
              nombreCompleto: a.nombreCompleto,
              numeroMatricula: a.numeroMatricula ?? null,
              telefono: a.telefono ?? null,
              email: a.email ?? null,
            },
            select: { id: true },
          })
          for (const clave of a.representados) abogadoDe.set(clave, id)
        }

        // Sin nombre se guarda vacío: "Desconocido N" es solo cómo se muestra
        const persona = async (
          { clave, datos: p }: { clave: string; datos: Persona },
          extra: Partial<Prisma.PersonaInvolucradaUncheckedCreateInput>,
        ) =>
          tx.personaInvolucrada.create({
            data: {
              idSiniestro,
              nombreCompletoRazonSocial: p.nombreCompletoRazonSocial ?? null,
              idTipoDocumento: p.idTipoDocumento ?? null,
              documento: p.documento ?? null,
              estadoCivil: p.estadoCivil ?? null,
              sexo: p.sexo ?? null,
              fechaNacimiento: p.fechaNacimiento ? dia(p.fechaNacimiento) : null,
              telefono: p.telefono ?? null,
              email: p.email ?? null,
              tipoLesion: p.conLesiones ? (p.tipoLesion ?? null) : null,
              descripcionLesiones: p.conLesiones ? (p.descripcionLesiones ?? null) : null,
              idDireccion: await direccion(p.domicilio),
              idAbogado: abogadoDe.get(clave) ?? null,
              ...extra,
            },
            select: { id: true },
          })
        const lugar = (p: { lugar?: string | null; lugarOtro?: string | null }) =>
          (p.lugar === 'Otro' ? p.lugarOtro : p.lugar) ?? null
        const permiso = (p: TitularAltaData | OcupanteAltaData) => ({
          numeroPermisoConducir: p.numeroPermisoConducir ?? null,
          fechaVencimientoCarnet: p.fechaVencimientoCarnet ? dia(p.fechaVencimientoCarnet) : null,
        })

        for (const { datos: v, titular, ocupantes } of alta.vehiculos) {
          const { id: idVehiculo } = await tx.vehiculo.create({
            data: {
              idSiniestro,
              dominio: v.dominio,
              rolAccidente: v.rolAccidente,
              marca: v.marca ?? null,
              modelo: v.modelo ?? null,
              version: v.version ?? null,
              numeroChasis: v.numeroChasis ?? null,
              numeroMotor: v.numeroMotor ?? null,
              anio: v.anio ?? null,
              uso: v.uso ?? null,
              tipo: v.tipo ?? null,
              color: v.color ?? null,
              idAseguradora: v.idAseguradora ?? null,
              acreedorPrendario: v.acreedorPrendario ?? null,
              descripcionDanos: v.descripcionDanos ?? null,
            },
            select: { id: true },
          })
          if (titular)
            await persona(titular, {
              idVehiculo,
              esPropietario: true,
              esOcupante: titular.datos.ibaEnVehiculo,
              rolEnVehiculo: titular.datos.ibaEnVehiculo ? lugar(titular.datos) : null,
              ...permiso(titular.datos),
            })
          for (const o of ocupantes)
            await persona(o, {
              idVehiculo,
              esPropietario: false,
              esOcupante: true,
              rolEnVehiculo: lugar(o.datos),
              relacionPropietario: o.datos.relacionPropietario ?? null,
              ...permiso(o.datos),
            })
        }
        for (const p of alta.personasExternas)
          await persona(p, { esOcupante: false, rolSinVehiculo: p.datos.rolSinVehiculo })

        for (const p of alta.peritos)
          await tx.perito.create({
            data: {
              idSiniestro,
              tipoPerito: p.tipoPerito,
              nombre: p.nombre,
              telefono: p.telefono ?? null,
              email: p.email ?? null,
              fechaSolicitud: diaArgentina(p.fechaSolicitud),
              fechaCierre: p.fechaCierre ? diaArgentina(p.fechaCierre) : null,
              cerrado: p.cerrado,
            },
          })

        const documentos: { id: number; clave: string }[] = []
        for (const d of alta.documentos) {
          const { id } = await tx.documentoSiniestro.create({
            data: {
              idSiniestro,
              idUsuario: actor.id,
              nombreOriginal: d.nombreOriginal,
              urlArchivoSinDominio: d.clave,
              tipoExtension: d.tipoExtension,
              mimeType: d.mimeType,
              tamanoBytes: BigInt(d.tamanoBytes),
            },
            select: { id: true },
          })
          documentos.push({ id, clave: d.clave })
          await tx.historialSiniestro.create({
            data: {
              idSiniestro,
              idUsuario: actor.id,
              ...eventoHistorial.documentoSubido(autor, d.nombreOriginal, ahora),
            },
          })
        }

        // Paso 36: asignación en el historial y aviso interno al asignado
        await tx.historialSiniestro.create({
          data: {
            idSiniestro,
            idUsuario: actor.id,
            ...eventoHistorial.asignacion(asignado, ahora),
          },
        })
        await tx.notificacion.create({
          data: {
            idSiniestro,
            idUsuario: asignado.id,
            tipoNotificacion: TipoNotificacion.ASIGNACION_SINIESTRO,
            mensaje: `Se te asignó el siniestro ${siniestro.numeroSiniestro}`,
            leida: false,
            revisada: false,
          },
        })
        return { siniestro, asignado, autor, aseguradora: aseguradora.nombre, documentos }
      })

      await moverAlSiniestro(creado.siniestro.id, creado.documentos)

      // El mail va después de confirmar: si falla, el siniestro y el aviso interno ya quedaron (36.a)
      let correoEnviado = true
      try {
        await enviarAvisoAsignacion({
          email: creado.asignado.email,
          nombre: creado.asignado.nombres,
          numeroSiniestro: creado.siniestro.numeroSiniestro,
          aseguradora: creado.aseguradora,
          asignadoPor: nombreCompleto(creado.autor),
          enlace: `${urlSistema.replace(/\/$/, '')}/siniestros/${creado.siniestro.id}`,
        })
      } catch (error) {
        correoEnviado = false
        console.error(
          `No se pudo enviar el aviso de asignación del siniestro ${creado.siniestro.id}: ${motivoFalloCorreo(error)}`,
        )
      }
      return {
        id: creado.siniestro.id,
        numeroSiniestro: creado.siniestro.numeroSiniestro,
        correoEnviado,
      }
    },
  }
}
