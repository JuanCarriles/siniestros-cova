-- Un vehículo se vinculaba al siniestro solo a través de sus personas: uno sin titular ni ocupantes (CU-09 11.a,
-- titular no identificado) quedaba suelto y no se veía en ningún siniestro. Ahora pertenece al siniestro.

-- 1) Antes de cambiar nada: un vehículo sin personas no se sabe de qué siniestro es. No se borra ni se adivina: la
--    migración se detiene y los lista. Para seguir, asignale una persona o borralo a mano, marcá la migración como
--    revertida (npx prisma migrate resolve --rolled-back 20261027130000_vehiculo_siniestro) y volvé a correrla.
DO $$
DECLARE
  sueltos TEXT;
BEGIN
  SELECT string_agg(format('id %s (dominio %s)', v."id", v."dominio"), ', ' ORDER BY v."id")
  INTO sueltos
  FROM "Vehiculo" v
  WHERE NOT EXISTS (SELECT 1 FROM "PersonaInvolucrada" p WHERE p."idVehiculo" = v."id");

  IF sueltos IS NOT NULL THEN
    RAISE EXCEPTION 'Hay vehículos sin personas y no se sabe a qué siniestro pertenecen: %. Resolvelos a mano antes de migrar.', sueltos;
  END IF;
END $$;

ALTER TABLE "Vehiculo" ADD COLUMN "idSiniestro" INTEGER;

-- 2) Cada vehículo queda en el siniestro de su primera persona
UPDATE "Vehiculo" v
SET "idSiniestro" = p."idSiniestro"
FROM (
  SELECT DISTINCT ON ("idVehiculo") "idVehiculo", "idSiniestro"
  FROM "PersonaInvolucrada"
  WHERE "idVehiculo" IS NOT NULL
  ORDER BY "idVehiculo", "id"
) p
WHERE p."idVehiculo" = v."id";

-- 3) Si el vehículo tenía personas de otros siniestros, cada uno de esos siniestros recibe su propia copia y sus
--    personas pasan a apuntar a ella. Ningún siniestro pierde el vehículo, y borrar uno no afecta al otro.
DO $$
DECLARE
  par RECORD;
  copia INTEGER;
BEGIN
  FOR par IN
    SELECT DISTINCT p."idVehiculo", p."idSiniestro"
    FROM "PersonaInvolucrada" p
    JOIN "Vehiculo" v ON v."id" = p."idVehiculo"
    WHERE p."idSiniestro" <> v."idSiniestro"
    ORDER BY p."idVehiculo", p."idSiniestro"
  LOOP
    INSERT INTO "Vehiculo" (
      "dominio", "marca", "modelo", "version", "acreedorPrendario", "numeroChasis", "anio", "numeroMotor",
      "tipo", "descripcionDanos", "color", "idAseguradora", "rolAccidente", "uso", "eliminado", "fechaBaja",
      "idSiniestro"
    )
    SELECT
      "dominio", "marca", "modelo", "version", "acreedorPrendario", "numeroChasis", "anio", "numeroMotor",
      "tipo", "descripcionDanos", "color", "idAseguradora", "rolAccidente", "uso", "eliminado", "fechaBaja",
      par."idSiniestro"
    FROM "Vehiculo"
    WHERE "id" = par."idVehiculo"
    RETURNING "id" INTO copia;

    UPDATE "PersonaInvolucrada"
    SET "idVehiculo" = copia
    WHERE "idVehiculo" = par."idVehiculo" AND "idSiniestro" = par."idSiniestro";
  END LOOP;
END $$;

ALTER TABLE "Vehiculo" ALTER COLUMN "idSiniestro" SET NOT NULL;
CREATE INDEX "Vehiculo_idSiniestro_idx" ON "Vehiculo"("idSiniestro");
ALTER TABLE "Vehiculo" ADD CONSTRAINT "Vehiculo_idSiniestro_fkey" FOREIGN KEY ("idSiniestro") REFERENCES "Siniestro"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
