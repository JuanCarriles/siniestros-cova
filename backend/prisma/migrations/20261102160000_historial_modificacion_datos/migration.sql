-- La edición de datos tiene su propio tipo de evento; no se confunde con una novedad o un cambio de estado.
ALTER TYPE "TipoEventoHistorial" ADD VALUE IF NOT EXISTS 'MODIFICACION_DATOS';
