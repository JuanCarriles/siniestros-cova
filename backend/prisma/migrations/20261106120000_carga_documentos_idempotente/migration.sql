-- Los documentos existentes conservan todos sus datos. NULL permite cargas anteriores sin identificador.
ALTER TABLE "DocumentoSiniestro" ADD COLUMN "idCarga" UUID,
  ADD COLUMN "hashContenido" VARCHAR(64);
CREATE UNIQUE INDEX "DocumentoSiniestro_idCarga_key" ON "DocumentoSiniestro" ("idCarga");
