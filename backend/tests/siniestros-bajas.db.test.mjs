import assert from 'node:assert/strict'
import test from 'node:test'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioBajasSiniestros } from '../src/modules/siniestros/siniestros-bajas.service.ts'
import { crearServicioSiniestros } from '../src/modules/siniestros/siniestros.service.ts'
import { filtrosSiniestrosSchema } from '../../shared/src/schemas/siniestros.ts'

test('PostgreSQL CU-09: baja trazable y borrado completo, recuperable ante fallos, sin afectar otros casos', async () => {
  const prisma = getPrisma()
  const rollback = new Error('Deshacer prueba CU-09 bajas')
  const marca = Date.now()
  const ahora = new Date('2026-10-25T15:00:00.000Z')
  try {
    await assert.rejects(
      prisma.$transaction(
        async (tx) => {
          const usuario = async (tipoUsuario) =>
            tx.usuario.create({
              data: {
                nombres: tipoUsuario === 'GESTOR' ? 'Pedro' : 'Ana',
                apellidos: 'Prueba',
                documento: '0',
                telefono: '0',
                email: `bajas.${tipoUsuario}.${marca}@example.invalid`,
                contrasena: '-',
                tipoUsuario,
                idDireccion: (await tx.direccion.create({ data: {} })).id,
              },
            })
          const admin = await usuario('ADMINISTRADOR')
          const superadmin = await usuario('SUPER_ADMINISTRADOR')
          const gestor = await usuario('GESTOR')
          const aseguradora = await tx.aseguradora.create({
            data: { nombre: `Prueba bajas ${marca}` },
          })
          const abierto = await tx.estadoSiniestro.findFirstOrThrow({ where: { esCierre: false } })
          const cierre = await tx.estadoSiniestro.findUniqueOrThrow({
            where: { nombre: 'Cierre enviado' },
          })
          assert.equal(cierre.esCierre, true)
          await tx.estadoSiniestro.update({
            where: { id: cierre.id },
            data: { nombre: `Cierre renombrado ${marca}` },
          })
          const otroCierre = await tx.estadoSiniestro.create({
            data: { nombre: `Otro cierre ${marca}`, descripcion: '-', esCierre: true },
          })
          let secuencia = 0
          const caso = (extra = {}) =>
            tx.siniestro.create({
              data: {
                numeroSiniestro: `PRUEBA-${marca}-${++secuencia}`,
                numeroPoliza: 'POL-PRUEBA',
                fechaAsignacion: ahora,
                demorado: false,
                menorEdadInvolucrado: false,
                idUsuario: gestor.id,
                idAseguradora: aseguradora.id,
                idEstadoSiniestro: abierto.id,
                ...extra,
              },
            })
          const documento = (s, nombre, extra = {}) =>
            tx.documentoSiniestro.create({
              data: {
                nombreOriginal: nombre,
                urlArchivoSinDominio: `siniestros/${s.id}/${nombre}`,
                tipoExtension: 'pdf',
                mimeType: 'application/pdf',
                tamanoBytes: 12n,
                idUsuario: gestor.id,
                idSiniestro: s.id,
                ...extra,
              },
            })
          const llamadas = []
          let claveFallida = null
          let agregarTarde = null
          const servicio = crearServicioBajasSiniestros({
            base: { transaccion: (trabajo) => trabajo(tx) },
            reloj: () => ahora,
            almacenamiento: () => ({
              eliminar: async (clave) => {
                llamadas.push(clave)
                if (clave === claveFallida) throw new Error('R2 temporalmente no disponible')
                if (agregarTarde) {
                  const trabajo = agregarTarde
                  agregarTarde = null
                  await trabajo()
                }
              },
            }),
          })
          const confirmar = (s) => ({ numeroSiniestro: s.numeroSiniestro })
          const obtener = (s) => tx.siniestro.findUniqueOrThrow({ where: { id: s.id } })
          const s = await caso()
          const docBaja = await documento(s, 'se-conserva.pdf')
          for (const accion of ['darDeBaja', 'reactivar', 'eliminar']) {
            await assert.rejects(servicio[accion](gestor, s.id, confirmar(s)), { status: 403 })
            await assert.rejects(
              servicio[accion]({ ...admin, id: 2147483647 }, s.id, confirmar(s)),
              { status: 401 },
            )
            await assert.rejects(
              servicio[accion](
                { ...gestor, tipoUsuario: 'SUPER_ADMINISTRADOR' },
                s.id,
                confirmar(s),
              ),
              { status: 403 },
            )
            if (accion === 'eliminar')
              await assert.rejects(servicio.eliminar(admin, s.id, { numeroSiniestro: 'OTRO' }), {
                status: 400,
              })
          }
          assert.equal(llamadas.length, 0)
          await servicio.darDeBaja(admin, s.id)
          const dadaBaja = await obtener(s)
          assert.equal(dadaBaja.eliminado, true)
          assert.equal(dadaBaja.fechaBaja.toISOString(), ahora.toISOString())
          const evento = await tx.historialSiniestro.findFirstOrThrow({
            where: { idSiniestro: s.id, tipoEvento: 'BAJA_SINIESTRO' },
          })
          assert.equal(evento.idUsuario, admin.id)
          assert.equal(evento.fechaEvento.toISOString(), ahora.toISOString())
          assert.match(evento.descripcion, /Ana Prueba dio de baja lógica/)
          assert.match(evento.descripcion, /25\/10\/2026/)
          await servicio.darDeBaja(superadmin, s.id)
          assert.equal(
            await tx.historialSiniestro.count({
              where: { idSiniestro: s.id, tipoEvento: 'BAJA_SINIESTRO' },
            }),
            1,
          )
          assert.ok(await tx.documentoSiniestro.findUnique({ where: { id: docBaja.id } }))
          assert.equal(llamadas.length, 0, 'la baja no elimina archivos')
          const lectura = crearServicioSiniestros(tx, () => ahora)
          const filtros = filtrosSiniestrosSchema.parse({ aseguradora: String(aseguradora.id) })
          assert.equal(
            (await lectura.listar(admin, filtros)).siniestros.some((f) => f.id === s.id),
            false,
          )
          assert.equal(
            (await lectura.listar(admin, { ...filtros, bajas: true })).siniestros.some(
              (f) => f.id === s.id,
            ),
            true,
          )
          assert.equal(
            (await lectura.listar(gestor, { ...filtros, bajas: true })).siniestros.some(
              (f) => f.id === s.id,
            ),
            false,
          )
          await assert.rejects(servicio.eliminar(admin, s.id, confirmar(s)), { status: 409 })
          // Reactivar conserva el expediente, quita la baja y deja un único evento por transición.
          await servicio.reactivar(admin, s.id)
          assert.equal((await obtener(s)).eliminado, false)
          assert.equal((await obtener(s)).fechaBaja, null)
          assert.equal((await obtener(s)).fechaUltimoMovimiento.toISOString(), ahora.toISOString())
          const reactivacion = await tx.historialSiniestro.findFirstOrThrow({
            where: { idSiniestro: s.id, tipoEvento: 'REACTIVACION_SINIESTRO' },
          })
          assert.equal(reactivacion.idUsuario, admin.id)
          assert.match(reactivacion.descripcion, /Ana Prueba reactivó el siniestro/)
          await servicio.reactivar(superadmin, s.id)
          assert.equal(
            await tx.historialSiniestro.count({
              where: { idSiniestro: s.id, tipoEvento: 'REACTIVACION_SINIESTRO' },
            }),
            1,
          )
          assert.ok(await tx.documentoSiniestro.findUnique({ where: { id: docBaja.id } }))
          assert.equal(llamadas.length, 0, 'reactivar no modifica R2')
          assert.equal(
            (await lectura.listar(gestor, filtros)).siniestros.some((f) => f.id === s.id),
            true,
          )
          await assert.rejects(servicio.reactivar(admin, 2147483647), { status: 404 })
          await servicio.darDeBaja(admin, s.id)
          await tx.usuario.update({
            where: { id: gestor.id },
            data: { eliminado: true, fechaBaja: ahora },
          })
          await assert.rejects(
            servicio.reactivar(admin, s.id),
            (e) => e.status === 409 && /usuario asignado/.test(e.message),
          )
          await tx.usuario.update({
            where: { id: gestor.id },
            data: { eliminado: false, fechaBaja: null },
          })
          const ajustador = await tx.ajustador.create({
            data: {
              nombres: 'Ajustador',
              apellidos: 'Prueba',
              telefono: '0',
              email: `ajustador.bajas.${marca}@example.invalid`,
              idAseguradora: aseguradora.id,
              eliminado: true,
              fechaBaja: ahora,
            },
          })
          await tx.siniestro.update({ where: { id: s.id }, data: { idAjustador: ajustador.id } })
          await assert.rejects(
            servicio.reactivar(admin, s.id),
            (e) => e.status === 409 && /ajustador asignado/.test(e.message),
          )
          await tx.ajustador.update({
            where: { id: ajustador.id },
            data: { eliminado: false, fechaBaja: null },
          })
          await servicio.reactivar(admin, s.id)
          const cierreConOtroNombre = await caso({ idEstadoSiniestro: otroCierre.id })
          await documento(cierreConOtroNombre, 'cierre-sin-baja.pdf')
          await assert.rejects(
            servicio.eliminar(admin, cierreConOtroNombre.id, confirmar(cierreConOtroNombre)),
            (e) => e.status === 409 && e.details.codigo === 'SINIESTRO_NO_DADO_DE_BAJA',
          )
          assert.equal(llamadas.length, 0, 'sin baja previa no se borra ningún archivo')
          assert.equal((await obtener(cierreConOtroNombre)).eliminacionEnCurso, false)
          await servicio.darDeBaja(admin, cierreConOtroNombre.id)
          const otroActivo = await caso({ idUsuario: admin.id })
          const bajasFiltro = await caso({ eliminado: true, fechaBaja: ahora })
          const cerradosFiltro = await caso({ idEstadoSiniestro: cierre.id })
          const soloActivos = await lectura.listar(
            admin,
            filtrosSiniestrosSchema.parse({
              aseguradora: String(aseguradora.id),
              gestor: String(gestor.id),
              activos: 'true',
              bajas: 'true',
            }),
          )
          assert.deepEqual(
            soloActivos.siniestros.map((f) => f.id),
            [s.id],
          )
          assert.equal(soloActivos.resumen.bajas, 0)
          assert.ok(
            !soloActivos.siniestros.some((f) =>
              [otroActivo.id, bajasFiltro.id, cerradosFiltro.id].includes(f.id),
            ),
          )
          await servicio.eliminar(admin, cierreConOtroNombre.id, confirmar(cierreConOtroNombre))
          assert.equal(
            await tx.siniestro.findUnique({ where: { id: cierreConOtroNombre.id } }),
            null,
          )
          const nombreSinBandera = await tx.estadoSiniestro.create({
            data: { nombre: 'Cierre enviado', descripcion: '-', esCierre: false },
          })
          const noCerrado = await caso({ idEstadoSiniestro: nombreSinBandera.id })
          await assert.rejects(servicio.eliminar(admin, noCerrado.id, confirmar(noCerrado)), {
            status: 409,
          })

          // Expediente completo, con relaciones eliminadas lógicamente y referencias compartidas.
          const objetivo = await caso({
            idEstadoSiniestro: cierre.id,
            idDireccion: admin.idDireccion,
          })
          await servicio.darDeBaja(admin, objetivo.id)
          const ajeno = await caso()
          const exclusivo = await tx.vehiculo.create({ data: { dominio: 'PRU123' } })
          const compartido = await tx.vehiculo.create({ data: { dominio: 'COM456' } })
          const direccionPersona = await tx.direccion.create({ data: { calle: 'Prueba' } })
          const direccionPerito = await tx.direccion.create({ data: { calle: 'Perito prueba' } })
          const abogado = await tx.abogado.create({ data: { nombreCompleto: 'Abogada prueba' } })
          await tx.personaInvolucrada.create({
            data: {
              idSiniestro: objetivo.id,
              idVehiculo: exclusivo.id,
              idDireccion: direccionPersona.id,
              idAbogado: abogado.id,
              nombreCompletoRazonSocial: 'Prueba persona',
              eliminado: true,
              fechaBaja: ahora,
            },
          })
          await tx.personaInvolucrada.create({
            data: { idSiniestro: objetivo.id, idVehiculo: compartido.id },
          })
          const personaAjena = await tx.personaInvolucrada.create({
            data: { idSiniestro: ajeno.id, idVehiculo: compartido.id },
          })
          await tx.perito.create({
            data: {
              nombre: 'Prueba perito',
              fechaSolicitud: ahora,
              cerrado: false,
              tipoPerito: 'CESVI',
              idSiniestro: objetivo.id,
              idDireccion: direccionPerito.id,
            },
          })
          const d1 = await documento(objetivo, 'a.pdf')
          const d2 = await documento(objetivo, 'b.pdf', { eliminado: true, fechaBaja: ahora })
          const docAjeno = await documento(ajeno, 'ajeno.pdf')
          const mensaje = await tx.mensajeChat.create({
            data: { contenidoMensaje: 'Prueba', idUsuario: gestor.id, idSiniestro: objetivo.id },
          })
          await tx.lecturaMensajeChat.create({
            data: { idMensajeChat: mensaje.id, idUsuario: admin.id, fechaLeido: ahora },
          })
          await tx.notificacion.create({
            data: {
              mensaje: 'Prueba',
              leida: false,
              revisada: false,
              idUsuario: admin.id,
              idSiniestro: objetivo.id,
              tipoNotificacion: 'DOCUMENTO_NUEVO',
            },
          })
          await tx.novedadSiniestro.create({
            data: { descripcion: 'Prueba', autor: 'Prueba', idSiniestro: objetivo.id },
          })
          await tx.historialSiniestro.create({
            data: {
              tipoEvento: 'ASIGNACION',
              descripcion: 'Prueba',
              idUsuario: admin.id,
              idSiniestro: objetivo.id,
            },
          })
          claveFallida = d2.urlArchivoSinDominio
          await assert.rejects(
            servicio.eliminar(admin, objetivo.id, confirmar(objetivo)),
            (e) => e.status === 503 && e.details.codigo === 'ELIMINACION_SINIESTRO_PENDIENTE',
          )
          assert.equal((await obtener(objetivo)).eliminacionEnCurso, true)
          assert.equal(
            await tx.documentoSiniestro.count({ where: { idSiniestro: objetivo.id } }),
            2,
          )
          assert.ok(await tx.personaInvolucrada.findUnique({ where: { id: personaAjena.id } }))
          await assert.rejects(lectura.obtener(admin, objetivo.id), { status: 403 })
          assert.equal(
            (await lectura.listar(gestor, filtros)).siniestros.some((f) => f.id === objetivo.id),
            false,
          )
          await assert.rejects(servicio.darDeBaja(admin, objetivo.id), {
            status: 409,
          })
          await assert.rejects(
            servicio.reactivar(admin, objetivo.id),
            (e) => e.status === 409 && /eliminación definitiva ya comenzó/.test(e.message),
          )
          claveFallida = null
          agregarTarde = () => documento(objetivo, 'tarde.pdf')
          await assert.rejects(
            servicio.eliminar(superadmin, objetivo.id, confirmar(objetivo)),
            (error) =>
              error.status === 409 && error.details.codigo === 'ELIMINACION_SINIESTRO_PENDIENTE',
          )
          assert.equal((await obtener(objetivo)).eliminacionEnCurso, true)
          assert.equal(
            await tx.documentoSiniestro.count({ where: { idSiniestro: objetivo.id } }),
            3,
          )
          assert.equal(
            llamadas.includes(`siniestros/${objetivo.id}/tarde.pdf`),
            false,
            'no hay una segunda pasada automática: el archivo nuevo espera el reintento explícito',
          )
          await servicio.eliminar(superadmin, objetivo.id, confirmar(objetivo))
          assert.equal(await tx.siniestro.findUnique({ where: { id: objetivo.id } }), null)
          for (const tabla of [
            'personaInvolucrada',
            'documentoSiniestro',
            'mensajeChat',
            'novedadSiniestro',
            'perito',
            'historialSiniestro',
            'notificacion',
          ]) {
            assert.equal(await tx[tabla].count({ where: { idSiniestro: objetivo.id } }), 0, tabla)
          }
          assert.equal(
            await tx.lecturaMensajeChat.count({ where: { idMensajeChat: mensaje.id } }),
            0,
          )
          assert.equal(await tx.vehiculo.findUnique({ where: { id: exclusivo.id } }), null)
          assert.ok(await tx.vehiculo.findUnique({ where: { id: compartido.id } }))
          assert.ok(await tx.personaInvolucrada.findUnique({ where: { id: personaAjena.id } }))
          assert.ok(await tx.documentoSiniestro.findUnique({ where: { id: docAjeno.id } }))
          assert.ok(await tx.abogado.findUnique({ where: { id: abogado.id } }))
          assert.equal(await tx.direccion.findUnique({ where: { id: direccionPersona.id } }), null)
          assert.equal(await tx.direccion.findUnique({ where: { id: direccionPerito.id } }), null)
          assert.ok(await tx.direccion.findUnique({ where: { id: admin.idDireccion } }))
          assert.ok(llamadas.includes(d1.urlArchivoSinDominio))
          assert.ok(llamadas.includes(`siniestros/${objetivo.id}/tarde.pdf`))
          assert.equal(llamadas.includes(docAjeno.urlArchivoSinDominio), false)
          const antesRepetir = llamadas.length
          await servicio.eliminar(admin, objetivo.id, confirmar(objetivo))
          assert.equal(llamadas.length, antesRepetir)

          // Número vigente y estado se vuelven a controlar después de R2.
          const cambiante = await caso({ idEstadoSiniestro: cierre.id })
          await servicio.darDeBaja(admin, cambiante.id)
          await documento(cambiante, 'cambia.pdf')
          agregarTarde = () =>
            tx.siniestro.update({
              where: { id: cambiante.id },
              data: { idEstadoSiniestro: abierto.id },
            })
          await assert.rejects(servicio.eliminar(admin, cambiante.id, confirmar(cambiante)), {
            status: 409,
          })
          assert.ok(await obtener(cambiante))
          assert.equal(
            await tx.documentoSiniestro.count({ where: { idSiniestro: cambiante.id } }),
            1,
          )
          const sinArchivos = await caso({
            idEstadoSiniestro: cierre.id,
            eliminado: true,
            fechaBaja: ahora,
          })
          await servicio.eliminar(admin, sinArchivos.id, confirmar(sinArchivos))
          assert.equal(await tx.siniestro.findUnique({ where: { id: sinArchivos.id } }), null)
          const fueraCarpeta = await caso({ idEstadoSiniestro: cierre.id })
          await servicio.darDeBaja(admin, fueraCarpeta.id)
          await documento(fueraCarpeta, 'incorrecto.pdf', {
            urlArchivoSinDominio: 'plantillas/no-tocar.pdf',
          })
          const previas = llamadas.length
          await assert.rejects(servicio.eliminar(admin, fueraCarpeta.id, confirmar(fueraCarpeta)), {
            status: 409,
          })
          assert.equal((await obtener(fueraCarpeta)).eliminacionEnCurso, false)
          assert.equal(llamadas.length, previas)
          // Si la baja cambia durante R2, el segundo control evita borrar los registros.
          const bajaCambiante = await caso({
            idEstadoSiniestro: cierre.id,
            eliminado: true,
            fechaBaja: ahora,
          })
          await documento(bajaCambiante, 'cambia-baja.pdf')
          agregarTarde = () =>
            tx.siniestro.update({
              where: { id: bajaCambiante.id },
              data: { eliminado: false, fechaBaja: null },
            })
          await assert.rejects(
            servicio.eliminar(admin, bajaCambiante.id, confirmar(bajaCambiante)),
            (e) => e.status === 409 && e.details.codigo === 'SINIESTRO_NO_DADO_DE_BAJA',
          )
          assert.ok(await obtener(bajaCambiante))
          // Compatibilidad con un borrado pendiente iniciado antes de exigir la baja previa.
          await servicio.darDeBaja(admin, bajaCambiante.id)
          assert.equal((await obtener(bajaCambiante)).eliminado, true)
          await servicio.eliminar(admin, bajaCambiante.id, confirmar(bajaCambiante))
          assert.equal(await tx.siniestro.findUnique({ where: { id: bajaCambiante.id } }), null)
          throw rollback
        },
        { timeout: 30000 },
      ),
      (error) => error === rollback,
    )
  } finally {
    await disconnectPrisma()
  }
})
