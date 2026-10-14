import { z } from 'zod'
import { booleanoSchema, documentoSchema, emailSchema, esquemaEdicion, fechaSchema, idSchema, opcional, telefonoSchema, textoSchema } from './comunes.ts'
import { tipoLesionSchema } from './enums.ts'

// Datos de alta de PersonaInvolucrada; id y baja lógica se gestionan por separado.
export const personaInvolucradaSchema = z.strictObject({
  idSiniestro: idSchema,
  nombreCompletoRazonSocial: opcional(textoSchema),
  estadoCivil: opcional(textoSchema),
  documento: opcional(documentoSchema),
  sexo: opcional(textoSchema),
  telefono: opcional(telefonoSchema),
  email: opcional(emailSchema),
  numeroPermisoConducir: opcional(textoSchema),
  descripcionLesiones: opcional(textoSchema),
  fechaNacimiento: opcional(fechaSchema),
  esOcupante: opcional(booleanoSchema),
  fechaVencimientoCarnet: opcional(fechaSchema),
  esPropietario: opcional(booleanoSchema),
  relacionPropietario: opcional(textoSchema),
  rolEnVehiculo: opcional(textoSchema),
  rolSinVehiculo: opcional(textoSchema),
  idDireccion: opcional(idSchema),
  idAbogado: opcional(idSchema),
  idTipoDocumento: opcional(idSchema),
  idVehiculo: opcional(idSchema),
  tipoLesion: opcional(tipoLesionSchema),
})

export const personaInvolucradaUpdateSchema = esquemaEdicion(personaInvolucradaSchema)

export type PersonaInvolucradaInput = z.input<typeof personaInvolucradaSchema>
export type PersonaInvolucradaData = z.output<typeof personaInvolucradaSchema>
export type PersonaInvolucradaUpdateInput = z.input<typeof personaInvolucradaUpdateSchema>
export type PersonaInvolucradaUpdateData = z.output<typeof personaInvolucradaUpdateSchema>
