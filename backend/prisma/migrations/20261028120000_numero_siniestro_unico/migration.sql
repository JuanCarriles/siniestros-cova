-- CU-09 5.b: el número de siniestro no se repite en una misma aseguradora, sin distinguir mayúsculas ("s-1" y "S-1"
-- son el mismo). El alta lo consulta antes de crear, pero dos altas simultáneas podían pasar las dos esa consulta:
-- la base es la que lo garantiza. Cuenta también los dados de baja, igual que el control del alta.
-- Prisma no puede declarar un índice sobre lower(): vive solo acá (ver el comentario en el modelo Siniestro).

-- Antes de crear el índice: si ya hay repetidos, la migración se detiene y los lista en vez de fallar con un error
-- de PostgreSQL. Para seguir, corregí los números, marcá la migración como revertida
-- (npx prisma migrate resolve --rolled-back 20261028120000_numero_siniestro_unico) y volvé a correrla.
DO $$
DECLARE
  repetidos TEXT;
BEGIN
  SELECT string_agg(format('"%s" en la aseguradora %s (siniestros %s)', numero, aseguradora, ids), '; ')
  INTO repetidos
  FROM (
    SELECT "idAseguradora" AS aseguradora, min("numeroSiniestro") AS numero,
           string_agg("id"::text, ', ' ORDER BY "id") AS ids
    FROM "Siniestro"
    GROUP BY "idAseguradora", lower("numeroSiniestro")
    HAVING count(*) > 1
  ) r;

  IF repetidos IS NOT NULL THEN
    RAISE EXCEPTION 'Hay números de siniestro repetidos en la misma aseguradora: %. Corregilos antes de migrar.', repetidos;
  END IF;
END $$;

CREATE UNIQUE INDEX "Siniestro_idAseguradora_numeroSiniestro_key"
  ON "Siniestro" ("idAseguradora", lower("numeroSiniestro"));
