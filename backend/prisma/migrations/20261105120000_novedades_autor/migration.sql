-- CU-10 1.f (E5-08): cada novedad guarda quién la cargó, como los documentos. La ficha muestra su nombre y su
-- tipo de usuario.
--
-- Las novedades anteriores se cargaron a nombre del usuario asignado al siniestro (así lo describía la columna
-- "autor"): se completan con él. "autor" sigue guardando el nombre tal como era al cargarla.

ALTER TABLE "NovedadSiniestro" ADD COLUMN "idUsuario" INTEGER;

UPDATE "NovedadSiniestro" n
SET "idUsuario" = s."idUsuario"
FROM "Siniestro" s
WHERE s."id" = n."idSiniestro";

ALTER TABLE "NovedadSiniestro" ALTER COLUMN "idUsuario" SET NOT NULL;

CREATE INDEX "NovedadSiniestro_idUsuario_idx" ON "NovedadSiniestro"("idUsuario");

ALTER TABLE "NovedadSiniestro" ADD CONSTRAINT "NovedadSiniestro_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
