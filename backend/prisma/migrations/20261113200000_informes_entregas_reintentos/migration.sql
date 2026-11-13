BEGIN;
ALTER TABLE "InformeMensual" ADD COLUMN "intentosFallidos" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "proximoIntento" TIMESTAMPTZ(3), ADD COLUMN "envioHasta" TIMESTAMPTZ(3);
CREATE TABLE "InformeMensualEnvio" (
 "id" UUID NOT NULL PRIMARY KEY,
 "idInforme" UUID NOT NULL,
 "idUsuario" INTEGER,
 "email" TEXT NOT NULL,
 "enviadoEn" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "InformeMensualEnvio_idInforme_fkey" FOREIGN KEY ("idInforme") REFERENCES "InformeMensual"("id") ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "InformeMensualEnvio_idInforme_email_key" ON "InformeMensualEnvio"("idInforme","email");
-- Conservar entregas anteriores confirmadas sin inventar destinatarios ni fechas.
INSERT INTO "InformeMensualEnvio" (id,"idInforme","idUsuario",email,"enviadoEn")
 SELECT gen_random_uuid(),i.id,u.id,i.destinatario,i."correoEnviado"
 FROM "InformeMensual" i LEFT JOIN "Usuario" u ON u.email=i.destinatario
 WHERE i."correoEnviado" IS NOT NULL AND i.destinatario IS NOT NULL;
COMMIT;
