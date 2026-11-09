-- CU-10 1.d y 1.e (E5-07): abogados y peritos desde la ficha con varios usuarios a la vez, como vehículos y personas
-- (migración 20261104120000_partes_concurrencia).
--
-- 1. Un perito activo de cada tipo por siniestro. La ficha ya ordena los cambios de un siniestro con un bloqueo; la
--    base es el último resguardo. Prisma no declara índices parciales: vive solo acá (ver el modelo Perito).
-- 2. revision: cuántas veces se modificó el registro. El formulario la manda con lo que abrió; si cambió mientras
--    tanto, el guardado se rechaza en vez de pisar el cambio del otro usuario.

-- Antes de crear el índice: si ya hay repetidos, la migración se detiene y los lista en vez de fallar con un error
-- de PostgreSQL. Para seguir, dá de baja uno desde la ficha, marcá la migración como revertida
-- (npx prisma migrate resolve --rolled-back 20261104130000_abogados_peritos_concurrencia) y volvé a correrla.
DO $$
DECLARE
  repetidos TEXT;
BEGIN
  SELECT string_agg(format('%s en el siniestro %s (peritos %s)', tipo, siniestro, ids), '; ')
  INTO repetidos
  FROM (
    SELECT "idSiniestro" AS siniestro, "tipoPerito" AS tipo, string_agg("id"::text, ', ' ORDER BY "id") AS ids
    FROM "Perito"
    WHERE NOT "eliminado"
    GROUP BY "idSiniestro", "tipoPerito"
    HAVING count(*) > 1
  ) r;

  IF repetidos IS NOT NULL THEN
    RAISE EXCEPTION 'Hay más de un perito activo del mismo tipo en un siniestro: %. Dejá uno solo antes de migrar.', repetidos;
  END IF;
END $$;

CREATE UNIQUE INDEX "Perito_tipo_activo_key"
  ON "Perito" ("idSiniestro", "tipoPerito")
  WHERE NOT "eliminado";

ALTER TABLE "Abogado" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Perito" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
