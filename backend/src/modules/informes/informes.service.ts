import { randomUUID } from 'node:crypto'
import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type { PrismaClient } from '../../generated/prisma/client.ts'
import type { AlmacenamientoR2 } from '../../lib/r2.ts'
import { crearEnvioInforme, siguienteIntentoInforme, ESPERA_INFORME_MS } from './informes.envio.ts'
import { HttpError } from '../../utils/httpError.ts'
import {
  calcularInforme,
  limitesMes,
  mesAnterior,
  mesesHasta,
  mesArgentina,
  type DatosInforme,
} from './informes.calculos.ts'
import { cargarRegistrosInforme } from './informes.registros.ts'
import { generarPdfInforme } from './informes.pdf.ts'

type Deps = {
  db: () => PrismaClient
  almacenamiento: () => AlmacenamientoR2
  pruebasHabilitadas: boolean
  enviar: (email: string, periodo: string, pdf: Buffer, clave: string) => Promise<void>
  reloj?: () => Date
}
export function crearServicioInformes(deps: Deps) {
  const reloj = deps.reloj ?? (() => new Date())
  async function autorizar(usuario: SesionUsuario, soloSuper = false) {
    const u = await deps.db().usuario.findFirst({
      where: { id: usuario.id, eliminado: false },
      select: { id: true, tipoUsuario: true },
    })
    if (!u) throw new HttpError(401, 'Tu sesión venció. Volvé a ingresar.')
    if (u.tipoUsuario === 'GESTOR' || (soloSuper && u.tipoUsuario !== 'SUPER_ADMINISTRADOR'))
      throw new HttpError(
        403,
        'Solo el superadministrador puede generar pruebas o enviar informes; la administración puede consultarlos.',
      )
  }
  const enviar = crearEnvioInforme(deps, reloj)
  async function generar(periodo: string, prueba: boolean, idSolicitante?: number, correo = false) {
    const ahora = reloj(),
      db = deps.db(),
      actual = mesArgentina(ahora)
    if (periodo > actual || (!prueba && periodo === actual))
      throw new HttpError(
        400,
        'Elegí un mes terminado; el mes actual solo se puede generar como prueba provisional.',
      )
    const clavePeriodo = prueba ? `prueba:${periodo}:${randomUUID()}` : periodo
    const preparado = await db.$transaction(async (tx) => {
      const lock = await tx.$queryRaw<
        { ok: boolean }[]
      >`SELECT pg_try_advisory_xact_lock(hashtextextended(${clavePeriodo}, 0)) AS ok`
      if (!lock[0]?.ok) throw new HttpError(409, 'El informe ya se está generando.')
      const anterior = await tx.informeMensual.findUnique({ where: { clavePeriodo } })
      if (anterior?.estado === 'LISTO') return { informe: anterior, reutilizado: true }
      // Una concesión persistida permite recuperarse de reinicios. La fecha actúa como token de la ejecución.
      if (
        anterior?.estado === 'GENERANDO' &&
        ahora.getTime() - anterior.fechaActualizacion.getTime() < ESPERA_INFORME_MS
      )
        throw new HttpError(
          409,
          'El informe ya se está generando. Esperá unos minutos y actualizá la lista.',
        )
      const informe = await tx.informeMensual.upsert({
        where: { clavePeriodo },
        create: {
          clavePeriodo,
          periodo,
          prueba,
          idSolicitante,
          estado: 'GENERANDO',
          fechaActualizacion: ahora,
        },
        update: { estado: 'GENERANDO', error: null, fechaActualizacion: ahora },
      })
      return { informe, reutilizado: false }
    })
    const { informe, reutilizado } = preparado
    if (!reutilizado) {
      let claveSubida: string | undefined
      try {
        const { registros, contexto } = await db.$transaction(
          (tx) => cargarRegistrosInforme(tx, periodo, ahora),
          { isolationLevel: 'RepeatableRead', timeout: 30000 },
        )
        const datos: DatosInforme = calcularInforme(periodo, registros, ahora, contexto)
        const meses = mesesHasta(periodo, 6)
        const anteriores = await db.informeMensual.findMany({
          where: { prueba: false, estado: 'LISTO', periodo: { in: meses } },
          select: { periodo: true, datos: true },
        })
        datos.tendencia = meses.map((p) => {
          const guardado = anteriores.find((i) => i.periodo === p)?.datos as
            DatosInforme | undefined
          const disponible = p === periodo ? datos : guardado
          return {
            periodo: p,
            nuevos: disponible?.completa ? disponible.nuevos : null,
            cerrados: disponible?.completa ? disponible.cerrados : null,
            abiertos: disponible?.completa ? disponible.abiertos : null,
          }
        })
        const previo = anteriores.find((i) => i.periodo === mesAnterior(periodo))?.datos as
          DatosInforme | undefined
        datos.comparacion =
          previo?.completa && datos.completa
            ? {
                nuevos: datos.nuevos - previo.nuevos,
                cerrados: datos.cerrados - previo.cerrados,
                abiertos: datos.abiertos - previo.abiertos,
              }
            : null
        // PDF en memoria; no se escribe HTML, JSON, imágenes ni archivos auxiliares en el bucket.
        const pdf = await generarPdfInforme(datos, prueba)
        const clave = `informes mensuales/${prueba ? 'pruebas/' : ''}${periodo.replace('-', '/')}/${randomUUID()}.pdf`
        await deps.almacenamiento().subirInforme(clave, pdf)
        claveSubida = clave
        const guardado = await db.informeMensual.updateMany({
          where: {
            id: informe.id,
            estado: 'GENERANDO',
            fechaActualizacion: informe.fechaActualizacion,
          },
          data: {
            estado: 'LISTO',
            datos,
            clavePdf: clave,
            tamanoBytes: pdf.length,
            error: null,
            intentosFallidos: 0,
            proximoIntento: null,
          },
        })
        if (guardado.count !== 1)
          throw new HttpError(
            409,
            'La ejecución fue reemplazada por un reintento. Actualizá la lista de informes.',
          )
      } catch (error) {
        if (claveSubida)
          await deps
            .almacenamiento()
            .eliminar(claveSubida)
            .catch(() => undefined)
        await db.informeMensual.updateMany({
          where: {
            id: informe.id,
            estado: 'GENERANDO',
            fechaActualizacion: informe.fechaActualizacion,
          },
          data: {
            estado: 'ERROR',
            error: 'No se pudo completar la generación. Podés reintentar.',
            intentosFallidos: informe.intentosFallidos + 1,
            proximoIntento: siguienteIntentoInforme(reloj(), informe.intentosFallidos + 1),
          },
        })
        throw error
      }
    }
    if (correo) await enviar(informe.id)
    return { id: informe.id }
  }
  return {
    async listar(usuario: SesionUsuario, pagina = 1) {
      await autorizar(usuario)
      const db = deps.db(),
        total = await db.informeMensual.count()
      pagina = Math.min(pagina, Math.max(1, Math.ceil(total / 20)))
      const informes = await db.informeMensual.findMany({
        include: { envios: { orderBy: { enviadoEn: 'asc' } } },
        orderBy: [{ fechaCreacion: 'desc' }, { id: 'desc' }],
        skip: (pagina - 1) * 20,
        take: 20,
      })
      return {
        informes: informes.map((i) => ({
          id: i.id,
          periodo: i.periodo,
          prueba: i.prueba,
          estado: i.estado,
          fechaCreacion: i.fechaCreacion.toISOString(),
          disponible: i.estado === 'LISTO' && i.clavePdf !== null,
          correoEnviado: i.correoEnviado?.toISOString() ?? null,
          error: i.error,
          proximoIntento: i.proximoIntento?.toISOString() ?? null,
          destinatarios: i.envios.map((e) => ({
            email: e.email,
            enviadoEn: e.enviadoEn.toISOString(),
          })),
        })),
        pruebasHabilitadas:
          deps.pruebasHabilitadas && usuario.tipoUsuario === 'SUPER_ADMINISTRADOR',
        total,
        pagina,
        paginas: Math.max(1, Math.ceil(total / 20)),
      }
    },
    async probar(usuario: SesionUsuario, periodo: string, correo: boolean) {
      await autorizar(usuario, true)
      if (!deps.pruebasHabilitadas)
        throw new HttpError(403, 'La generación manual de pruebas está deshabilitada.')
      return generar(periodo, true, usuario.id, correo)
    },
    async descargar(usuario: SesionUsuario, id: string) {
      await autorizar(usuario)
      const informe = await deps.db().informeMensual.findUnique({ where: { id } })
      if (!informe?.clavePdf || informe.estado !== 'LISTO')
        throw new HttpError(404, 'El PDF todavía no está disponible.')
      return deps
        .almacenamiento()
        .firmarDescarga(
          informe.clavePdf,
          `informe-mensual-${informe.periodo}${informe.prueba ? '-prueba' : ''}.pdf`,
          'application/pdf',
        )
    },
    async reenviar(usuario: SesionUsuario, id: string) {
      await autorizar(usuario, true)
      await enviar(id)
    },
    async reintentar(usuario: SesionUsuario, id: string) {
      await autorizar(usuario, true)
      const i = await deps.db().informeMensual.findUnique({ where: { id } })
      if (!i) throw new HttpError(404, 'El informe no existe.')
      if (i.prueba) throw new HttpError(409, 'Generá otra prueba desde el panel.')
      return generar(i.periodo, false, usuario.id, true)
    },
    async revisarPendientes() {
      const ahora = reloj(),
        partes = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Argentina/Buenos_Aires',
          hour: '2-digit',
          hourCycle: 'h23',
        }).format(ahora)
      // El primer día antes de las 07:00 aún no corresponde generar el mes anterior.
      const dia = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: '2-digit',
      }).format(ahora)
      if (dia === '01' && Number(partes) < 7) return
      const inicio = await deps.db().registroEstadisticoSiniestro.findFirst({
        where: { evento: 'INICIO' },
        orderBy: { fechaRegistro: 'asc' },
      })
      if (!inicio) return
      const ultimo = mesAnterior(mesArgentina(ahora))
      let p = mesArgentina(inicio.fechaRegistro)
      // Un informe por vuelta evita bloquear el servidor al recuperar varios meses pendientes.
      while (p <= ultimo) {
        const i = await deps.db().informeMensual.findUnique({ where: { clavePeriodo: p } })
        const ocupado =
          (i?.estado === 'GENERANDO' &&
            ahora.getTime() - i.fechaActualizacion.getTime() < ESPERA_INFORME_MS) ||
          (i?.envioHasta && i.envioHasta > ahora)
        if (
          (i?.estado !== 'LISTO' || !i.correoEnviado) &&
          !ocupado &&
          (!i?.proximoIntento || i.proximoIntento <= ahora)
        ) {
          try {
            await generar(p, false, undefined, true)
          } catch (error) {
            // Si un fallo se produjo antes de registrar su espera, no dejar ese período bloqueando la cola.
            const actual = await deps.db().informeMensual.findUnique({ where: { clavePeriodo: p } })
            if (
              actual &&
              !(actual.estado === 'LISTO' && actual.correoEnviado) &&
              (!actual.proximoIntento || actual.proximoIntento <= ahora) &&
              (!actual.envioHasta || actual.envioHasta <= ahora) &&
              !(
                actual.estado === 'GENERANDO' &&
                ahora.getTime() - actual.fechaActualizacion.getTime() < ESPERA_INFORME_MS
              )
            ) {
              const fallos = actual.intentosFallidos + 1
              await deps
                .db()
                .informeMensual.updateMany({
                  where: { id: actual.id, fechaActualizacion: actual.fechaActualizacion },
                  data: {
                    intentosFallidos: fallos,
                    proximoIntento: siguienteIntentoInforme(ahora, fallos),
                    error: 'No se pudo procesar este informe. Se reintentará más tarde.',
                  },
                })
            }
            throw error
          }
          return
        }
        const f = limitesMes(p).fin
        p = mesArgentina(f)
      }
    },
  }
}
