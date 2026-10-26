-- Se conservan las plantillas anteriores y sus claves de R2.
ALTER TABLE "DocumentoPlantilla"
  ADD COLUMN "encabezado" TEXT,
  ADD COLUMN "descripcion" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "tamanoBytes" BIGINT;
UPDATE "DocumentoPlantilla" SET "encabezado" = "nombreOriginal";
ALTER TABLE "DocumentoPlantilla" ALTER COLUMN "encabezado" SET NOT NULL;
ALTER TABLE "DocumentoPlantilla" ADD CONSTRAINT "DocumentoPlantilla_tamano_positivo"
  CHECK ("tamanoBytes" IS NULL OR "tamanoBytes" > 0);
