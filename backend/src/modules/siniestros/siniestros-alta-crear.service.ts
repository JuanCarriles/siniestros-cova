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

const MENSAJE_DUPLICADO =
  'Ya existe un siniestro con este número para esta aseguradora. Corregilo en el paso 1.'
const errorAlmacenamiento = () =>
  new HttpError(
    503,
    'No se pudieron guardar los documentos en el almacenamiento. Probá de nuevo en unos minutos: lo cargado no se pierde.',
  )
const esNumeroRepetido = (error: unknown) =>
  !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002'

// CU-09 pasos 32-36 (E4-10). Los documentos se suben a R2 a medida que se eligen, a la carpeta del alta de quien
// la carga (todavía no hay siniestro). Al confirmar se crea todo en una sola transacción, que además copia cada
// documento a la carpeta del siniestro: el siniestro solo existe con sus documentos ya guardados en su lugar
// definitivo. Después se borran los originales y se avisa al asignado. altas/ es temporal: una regla de R2 borra lo
// que tenga más de 30 días (altas abandonadas), ver DEPLOY.md.
export function crearServicioCrearSiniestro(deps: {
  transaccion: <T>(trabajo: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>
  almacenamiento: () => AlmacenamientoR2
  enviarAvisoAsignacion: (aviso: AvisoAsignacion) => Promise<void>
  /** Dirección del sistema, para el enlace del mail */
  urlSistema: string
}) {
  const { transaccion, almacenamiento, enviarAvisoAsignacion, urlSistema } = deps

  // Antes de crear: un borrador retomado después de 30 días puede listar archivos que la regla de altas/ ya borró.
  // Se avisan todos juntos para volver a cargarlos; si R2 no responde, no se crea nada y se puede reintentar.
  async function exigirDocumentos(documentos: DocumentoAlta[]) {
    const faltan: string[] = []
    for (const d of documentos) {
      try {
        await almacenamiento().comprobarExistencia(d.clave)
      } catch (error) {
        if (error instanceof HttpError && error.status === 404) faltan.push(d.nombreOriginal)
        else throw errorAlmacenamiento()
      }
    }
    if (faltan.length)
      throw new HttpError(
        409,
        `${faltan.map((n) => `«${n}»`).join(', ')} ya no ${faltan.length === 1 ? 'está disponible' : 'están disponibles'}: ${faltan.length === 1 ? 'quitalo y volvé a cargarlo' : 'quitalos y volvé a cargarlos'} en el paso 5.`,
        { campo: 'documentos' },
      )
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

      // Copias ya hechas en la carpeta del siniestro: si la transacción no se confirma, se borran
      const copias: string[] = []
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
        if (duplicado) throw error(409, MENSAJE_DUPLICADO, 'numeroSiniestro')
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
        // Después del número repetido: si el alta se mandó dos veces, el motivo es el número, no los archivos
        // (la primera ya los copió y borró los originales)
        await exigirDocumentos(alta.documentos)

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

        const siniestro = await tx.siniestro
          .create({
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
          .catch((e: unknown) => {
            // Dos altas simultáneas con el mismo número pasan las dos la consulta de arriba: el índice único de la
            // base (migración numero_siniestro_unico) frena a la segunda
            throw esNumeroRepetido(e) ? error(409, MENSAJE_DUPLICADO, 'numeroSiniestro') : e
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

        // Cada documento se copia a la carpeta del siniestro y se registra con esa clave: si R2 falla, no se crea
        // nada. Los originales de altas/ se borran después de confirmar.
        for (const d of alta.documentos) {
          let clave: string
          try {
            clave = await almacenamiento().copiar(d.clave, `siniestros/${idSiniestro}`)
          } catch {
            throw errorAlmacenamiento()
          }
          copias.push(clave)
          await tx.documentoSiniestro.create({
            data: {
              idSiniestro,
              idUsuario: actor.id,
              nombreOriginal: d.nombreOriginal,
              urlArchivoSinDominio: clave,
              tipoExtension: d.tipoExtension,
              mimeType: d.mimeType,
              tamanoBytes: BigInt(d.tamanoBytes),
            },
          })
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
        return { siniestro, asignado, autor, aseguradora: aseguradora.nombre }
      }).catch(async (error: unknown) => {
        for (const copia of copias)
          await almacenamiento()
            .eliminar(copia)
            .catch(() => console.error(`Copia sobrante en R2 (el alta no se creó): ${copia}`))
        throw error
      })

      // El siniestro ya tiene sus copias: si algún original no se puede borrar, lo limpia la regla de altas/
      for (const d of alta.documentos)
        await almacenamiento()
          .eliminar(d.clave)
          .catch(() =>
            console.error(`Original sobrante en R2 (lo borra la regla de altas/): ${d.clave}`),
          )

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
