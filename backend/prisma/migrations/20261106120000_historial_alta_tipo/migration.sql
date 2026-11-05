-- CU-10 1.i (E5-09): el alta del siniestro tiene su propio evento en el historial.
-- Va sola: PostgreSQL no deja usar un valor nuevo de un enum en la misma transacción que lo agrega. Los siniestros
-- que ya existen lo reciben en la migración siguiente (20261106120100_historial_alta_existentes).
ALTER TYPE "TipoEventoHistorial" ADD VALUE IF NOT EXISTS 'ALTA_SINIESTRO';
