-- E6-02: derivados opcionales. Los documentos anteriores y sus originales se conservan.
ALTER TABLE "DocumentoSiniestro"
  ADD COLUMN "claveImagenOptimizada" TEXT,
  ADD COLUMN "claveMiniatura" TEXT,
  ADD COLUMN "anchoOriginal" INTEGER,
  ADD COLUMN "altoOriginal" INTEGER,
  ADD COLUMN "anchoImagen" INTEGER,
  ADD COLUMN "altoImagen" INTEGER,
  ADD COLUMN "tamanoOptimizadoBytes" BIGINT;
