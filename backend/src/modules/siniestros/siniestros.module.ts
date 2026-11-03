import { crearServicioDocumentosGestion } from '../documentos/documentos-gestion.service.ts'
import { configCorreo } from '../../config/correo.ts'
import { env } from '../../config/env.ts'
import { crearCorreoAsignacion } from '../../lib/correo-asignacion.ts'
import { crearCorreoReasignacion } from '../../lib/correo-reasignacion.ts'
import { crearServicioReasignacion } from './siniestros-reasignacion.service.ts'
import { crearAlmacenamientoR2, type AlmacenamientoR2 } from '../../lib/r2.ts'
import { getPrisma } from '../../lib/prisma.ts'
import { requerirSesion } from '../auth/auth.module.ts'
import { crearServicioDocumentosFicha } from '../documentos/documentos-ficha.service.ts'
import { crearServicioHistorialFicha } from '../historial/historial-ficha.service.ts'
import { crearServicioNovedadesFicha } from '../novedades/novedades-ficha.service.ts'
import { crearServicioAbogadosFicha } from './abogados/abogados-ficha.service.ts'
import { crearServicioAbogadosGestion } from './abogados/abogados-gestion.service.ts'
import { crearServicioPeritosFicha } from './peritos/peritos-ficha.service.ts'
import { crearServicioPeritosGestion } from './peritos/peritos-gestion.service.ts'
import { crearServicioCrearSiniestro } from './siniestros-alta-crear.service.ts'
import { crearServicioAltaSiniestros } from './siniestros-alta.service.ts'
import { crearServicioBajasSiniestros } from './siniestros-bajas.service.ts'
import type { Transaccion } from './partes-edicion.ts'
import { crearServicioEstadoSiniestro } from './siniestros-estado.service.ts'
import { crearServicioEdicionCaso } from './siniestros-edicion.service.ts'
import { crearSiniestrosRouter } from './siniestros.routes.ts'
import { crearServicioSiniestros } from './siniestros.service.ts'
import { crearServicioPersonasGestion } from './personas/personas-gestion.service.ts'
import { crearServicioVehiculosFicha } from './vehiculos/vehiculos-ficha.service.ts'
import { crearServicioVehiculosGestion } from './vehiculos/vehiculos-gestion.service.ts'

// Acceso diferido a la base: el cliente se crea en el primer pedido, no al importar
const db = {
  get siniestro() {
    return getPrisma().siniestro
  },
  get estadoSiniestro() {
    return getPrisma().estadoSiniestro
  },
  get aseguradora() {
    return getPrisma().aseguradora
  },
  get usuario() {
    return getPrisma().usuario
  },
  get ajustador() {
    return getPrisma().ajustador
  },
  get pais() {
    return getPrisma().pais
  },
  get provincia() {
    return getPrisma().provincia
  },
  get tipoDocumento() {
    return getPrisma().tipoDocumento
  },
  get vehiculo() {
    return getPrisma().vehiculo
  },
  get personaInvolucrada() {
    return getPrisma().personaInvolucrada
  },
  get abogado() {
    return getPrisma().abogado
  },
  get perito() {
    return getPrisma().perito
  },
  get novedadSiniestro() {
    return getPrisma().novedadSiniestro
  },
  get documentoSiniestro() {
    return getPrisma().documentoSiniestro
  },
  get historialSiniestro() {
    return getPrisma().historialSiniestro
  },
  get $queryRaw() {
    const prisma = getPrisma()
    return prisma.$queryRaw.bind(prisma)
  },
}

let almacenamiento: AlmacenamientoR2 | undefined
const r2 = () => (almacenamiento ??= crearAlmacenamientoR2())
const operaciones = crearServicioBajasSiniestros({
  almacenamiento: r2,
  base: {
    transaccion: (trabajo) => getPrisma().$transaction(trabajo, { timeout: 15_000 }),
  },
})

// Vehículos, personas, abogados y peritos desde la ficha (E5-06 y E5-07): cada cambio y su evento del historial, juntos
const transaccionPartes: Transaccion = (trabajo) =>
  getPrisma().$transaction(trabajo, { timeout: 15_000 })

export const siniestrosRouter = crearSiniestrosRouter({
  documentosCarga: crearServicioDocumentosGestion({
    transaccion: transaccionPartes,
    almacenamiento: r2,
  }),
  servicio: crearServicioSiniestros(db),
  alta: crearServicioAltaSiniestros(db),
  creacion: crearServicioCrearSiniestro({
    transaccion: (trabajo) => getPrisma().$transaction(trabajo, { timeout: 30_000 }),
    almacenamiento: r2,
    enviarAvisoAsignacion: crearCorreoAsignacion(configCorreo),
    urlSistema: env.APP_URL,
  }),
  operaciones,
  edicion: crearServicioEdicionCaso({
    transaccion: (trabajo) => getPrisma().$transaction(trabajo, { timeout: 15_000 }),
  }),
  estados: crearServicioEstadoSiniestro({
    transaccion: (trabajo) => getPrisma().$transaction(trabajo, { timeout: 15_000 }),
  }),
  ficha: {
    vehiculos: crearServicioVehiculosFicha(db),
    abogados: crearServicioAbogadosFicha(db),
    peritos: crearServicioPeritosFicha(db),
    novedades: crearServicioNovedadesFicha(db),
    documentos: crearServicioDocumentosFicha(db),
    historial: crearServicioHistorialFicha(db),
  },
  vehiculos: crearServicioVehiculosGestion({ transaccion: transaccionPartes }),
  personas: crearServicioPersonasGestion({ transaccion: transaccionPartes }),
  abogados: crearServicioAbogadosGestion({ transaccion: transaccionPartes }),
  peritos: crearServicioPeritosGestion({ transaccion: transaccionPartes }),
  reasignacion: crearServicioReasignacion({
    transaccion: (trabajo) => getPrisma().$transaction(trabajo, { timeout: 15_000 }),
    enviarAviso: crearCorreoReasignacion(configCorreo),
    urlSistema: env.APP_URL,
  }),
  requerirSesion,
})
