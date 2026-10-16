-- CreateTable
CREATE TABLE "Sesion" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "idUsuario" INTEGER NOT NULL,
    "fechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaActividad" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaVencimiento" TIMESTAMPTZ(3) NOT NULL,
    "ip" TEXT,
    "navegador" TEXT,

    CONSTRAINT "Sesion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sesion_tokenHash_key" ON "Sesion"("tokenHash");

-- CreateIndex
CREATE INDEX "Sesion_idUsuario_idx" ON "Sesion"("idUsuario");

-- CreateIndex
CREATE INDEX "Sesion_fechaVencimiento_idx" ON "Sesion"("fechaVencimiento");

-- AddForeignKey
ALTER TABLE "Sesion" ADD CONSTRAINT "Sesion_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE RESTRICT;
