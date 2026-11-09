ALTER TABLE "DocumentoSiniestro" ADD COLUMN "motivoBaja" VARCHAR(1000), ADD COLUMN "idUsuarioBaja" INTEGER;
CREATE INDEX "DocumentoSiniestro_idUsuarioBaja_idx" ON "DocumentoSiniestro"("idUsuarioBaja");
ALTER TABLE "DocumentoSiniestro" ADD CONSTRAINT "DocumentoSiniestro_idUsuarioBaja_fkey" FOREIGN KEY ("idUsuarioBaja") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
