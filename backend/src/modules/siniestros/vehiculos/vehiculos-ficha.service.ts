import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type {
  PersonaFicha,
  PersonaVehiculoFicha,
  VehiculosYPartesFicha,
} from '@cova/shared/schemas/ficha-siniestro'
import type { Prisma } from '../../../generated/prisma/client.ts'
import { aDireccion, dia, nombreOpcional, selectDireccion } from '../ficha.ts'
import { exigirAccesoSiniestro } from '../siniestros-acceso.ts'

type Base = Pick<Prisma.TransactionClient, 'siniestro' | 'vehiculo' | 'personaInvolucrada'>

const selectPersona = {
  id: true,
  idVehiculo: true,
  nombreCompletoRazonSocial: true,
  documento: true,
  estadoCivil: true,
  sexo: true,
  fechaNacimiento: true,
  telefono: true,
  email: true,
  esPropietario: true,
  esOcupante: true,
  rolEnVehiculo: true,
  rolSinVehiculo: true,
  relacionPropietario: true,
  numeroPermisoConducir: true,
  fechaVencimientoCarnet: true,
  tipoLesion: true,
  descripcionLesiones: true,
  tipoDocumento: { select: { nombre: true } },
  direccion: { select: selectDireccion },
  abogado: { select: { id: true, nombreCompleto: true, eliminado: true } },
} as const satisfies Prisma.PersonaInvolucradaSelect

type FilaPersona = Prisma.PersonaInvolucradaGetPayload<{ select: typeof selectPersona }>

function aPersona(p: FilaPersona): PersonaFicha {
  return {
    id: p.id,
    nombre: nombreOpcional(p),
    tipoDocumento: p.tipoDocumento?.nombre ?? null,
    documento: p.documento,
    estadoCivil: p.estadoCivil,
    sexo: p.sexo,
    fechaNacimiento: dia(p.fechaNacimiento),
    telefono: p.telefono,
    email: p.email,
    domicilio: aDireccion(p.direccion),
    lesion: p.tipoLesion ? { tipo: p.tipoLesion, descripcion: p.descripcionLesiones } : null,
    abogado:
      p.abogado && !p.abogado.eliminado
        ? { id: p.abogado.id, nombreCompleto: p.abogado.nombreCompleto }
        : null,
  }
}

function aPersonaVehiculo(p: FilaPersona): PersonaVehiculoFicha {
  return {
    ...aPersona(p),
    // El titular guarda si iba; los ocupantes iban siempre
    ibaEnVehiculo: p.esPropietario ? p.esOcupante === true : true,
    lugarEnVehiculo: p.rolEnVehiculo,
    numeroPermisoConducir: p.numeroPermisoConducir,
    fechaVencimientoCarnet: dia(p.fechaVencimientoCarnet),
    relacionTitular: p.esPropietario ? null : p.relacionPropietario,
  }
}

// CU-10 1.c (E5-01): vehículos con su titular y sus ocupantes, y aparte las personas fuera de los vehículos.
// Primero el asegurado, después los terceros en el orden en que se cargaron.
export function crearServicioVehiculosFicha(prisma: Base) {
  return {
    async listar(usuario: SesionUsuario, idSiniestro: number): Promise<VehiculosYPartesFicha> {
      await exigirAccesoSiniestro(prisma, usuario, idSiniestro)
      const [vehiculos, personas] = await Promise.all([
        prisma.vehiculo.findMany({
          where: { idSiniestro, eliminado: false },
          orderBy: { id: 'asc' },
          select: {
            id: true,
            rolAccidente: true,
            marca: true,
            modelo: true,
            version: true,
            dominio: true,
            anio: true,
            uso: true,
            tipo: true,
            color: true,
            numeroChasis: true,
            numeroMotor: true,
            acreedorPrendario: true,
            descripcionDanos: true,
            aseguradora: { select: { nombre: true } },
          },
        }),
        prisma.personaInvolucrada.findMany({
          where: { idSiniestro, eliminado: false },
          orderBy: { id: 'asc' },
          select: selectPersona,
        }),
      ])
      const asegurado = (rol: string | null) => (rol === 'ASEGURADO' ? 0 : 1)
      return {
        vehiculos: [...vehiculos]
          .sort((a, b) => asegurado(a.rolAccidente) - asegurado(b.rolAccidente))
          .map(({ aseguradora, ...v }) => {
            const suyas = personas.filter((p) => p.idVehiculo === v.id)
            const titular = suyas.find((p) => p.esPropietario) ?? null
            return {
              ...v,
              aseguradora: aseguradora?.nombre ?? null,
              titular: titular && aPersonaVehiculo(titular),
              ocupantes: suyas.filter((p) => !p.esPropietario).map(aPersonaVehiculo),
            }
          }),
        personasFuera: personas
          .filter((p) => p.idVehiculo === null)
          .map((p) => ({ ...aPersona(p), rolSinVehiculo: p.rolSinVehiculo })),
      }
    },
  }
}
