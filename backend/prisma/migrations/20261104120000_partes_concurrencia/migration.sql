-- CU-10 1.c (E5-06): vehículos y personas desde la ficha con varios usuarios a la vez.
--
-- 1. Un titular activo por vehículo y un dominio activo por siniestro (sin contar espacios ni guiones, sin distinguir
--    mayúsculas, igual que normalizarDominio). La ficha ya ordena los cambios de un siniestro con un bloqueo; la base
--    es el último resguardo. Prisma no declara índices parciales ni sobre expresiones: viven solo acá (ver los
--    comentarios en los modelos Vehiculo y PersonaInvolucrada).
-- 2. revision: cuántas veces se modificó el registro. El formulario la manda con lo que abrió; si cambió mientras
--    tanto, el guardado se rechaza en vez de pisar el cambio del otro usuario.

-- Antes de crear los índices: si ya hay repetidos, la migración se detiene y los lista en vez de fallar con un error
-- de PostgreSQL. Para seguir, dá de baja o corregí los repetidos desde la ficha, marcá la migración como revertida
-- (npx prisma migrate resolve --rolled-back 20261104120000_partes_concurrencia) y volvé a correrla.
DO $$
DECLARE
  titulares TEXT;
  dominios TEXT;
BEGIN
  SELECT string_agg(format('vehículo %s (personas %s)', vehiculo, ids), '; ')
  INTO titulares
  FROM (
    SELECT "idVehiculo" AS vehiculo, string_agg("id"::text, ', ' ORDER BY "id") AS ids
    FROM "PersonaInvolucrada"
    WHERE "esPropietario" AND NOT "eliminado" AND "idVehiculo" IS NOT NULL
    GROUP BY "idVehiculo"
    HAVING count(*) > 1
  ) r;

  SELECT string_agg(format('%s en el siniestro %s (vehículos %s)', dominio, siniestro, ids), '; ')
  INTO dominios
  FROM (
    SELECT "idSiniestro" AS siniestro, min("dominio") AS dominio,
           string_agg("id"::text, ', ' ORDER BY "id") AS ids
    FROM "Vehiculo"
    WHERE NOT "eliminado"
    GROUP BY "idSiniestro", upper(regexp_replace("dominio", '[[:space:]-]', '', 'g'))
    HAVING count(*) > 1
  ) r;

  IF titulares IS NOT NULL THEN
    RAISE EXCEPTION 'Hay vehículos con más de un titular activo: %. Dejá uno solo antes de migrar.', titulares;
  END IF;
  IF dominios IS NOT NULL THEN
    RAISE EXCEPTION 'Hay dominios repetidos en un mismo siniestro: %. Corregilos antes de migrar.', dominios;
  END IF;
END $$;

CREATE UNIQUE INDEX "PersonaInvolucrada_titular_activo_key"
  ON "PersonaInvolucrada" ("idVehiculo")
  WHERE "esPropietario" AND NOT "eliminado" AND "idVehiculo" IS NOT NULL;

CREATE UNIQUE INDEX "Vehiculo_dominio_activo_key"
  ON "Vehiculo" ("idSiniestro", upper(regexp_replace("dominio", '[[:space:]-]', '', 'g')))
  WHERE NOT "eliminado";

ALTER TABLE "Vehiculo" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PersonaInvolucrada" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
