-- Un vehículo se vinculaba al siniestro solo a través de sus personas: uno sin titular ni ocupantes (CU-09 11.a,
-- titular no identificado) quedaba suelto y no se veía en ningún siniestro. Ahora pertenece al siniestro.
ALTER TABLE "Vehiculo" ADD COLUMN "idSiniestro" INTEGER;

-- Los existentes toman el siniestro de sus personas (la primera, si hubiera más de un siniestro)
UPDATE "Vehiculo" v
SET "idSiniestro" = p."idSiniestro"
FROM (
  SELECT DISTINCT ON ("idVehiculo") "idVehiculo", "idSiniestro"
  FROM "PersonaInvolucrada"
  WHERE "idVehiculo" IS NOT NULL
  ORDER BY "idVehiculo", "id"
) p
WHERE p."idVehiculo" = v."id";

-- Un vehículo sin personas no se puede ubicar en ningún siniestro (no se mostraba en ninguna pantalla)
DELETE FROM "Vehiculo" WHERE "idSiniestro" IS NULL;

ALTER TABLE "Vehiculo" ALTER COLUMN "idSiniestro" SET NOT NULL;
CREATE INDEX "Vehiculo_idSiniestro_idx" ON "Vehiculo"("idSiniestro");
ALTER TABLE "Vehiculo" ADD CONSTRAINT "Vehiculo_idSiniestro_fkey" FOREIGN KEY ("idSiniestro") REFERENCES "Siniestro"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
