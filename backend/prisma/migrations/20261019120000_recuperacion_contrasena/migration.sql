CREATE TABLE "RecuperacionContrasena" (
    "id" SERIAL NOT NULL,
    "idUsuario" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "codigoHash" TEXT,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "fechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaVencimiento" TIMESTAMPTZ(3) NOT NULL,
    "fechaVerificacion" TIMESTAMPTZ(3),
    CONSTRAINT "RecuperacionContrasena_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RecuperacionContrasena_idUsuario_key" ON "RecuperacionContrasena"("idUsuario");
CREATE UNIQUE INDEX "RecuperacionContrasena_tokenHash_key" ON "RecuperacionContrasena"("tokenHash");
CREATE INDEX "RecuperacionContrasena_fechaVencimiento_idx" ON "RecuperacionContrasena"("fechaVencimiento");
ALTER TABLE "RecuperacionContrasena" ADD CONSTRAINT "RecuperacionContrasena_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE RESTRICT;
