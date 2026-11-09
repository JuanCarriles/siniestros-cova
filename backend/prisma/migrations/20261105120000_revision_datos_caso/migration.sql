-- E5-02: revisión de póliza, ajustador, hecho y lugar para evitar pisar formularios abiertos.
-- Se agrega al final del historial publicado. No renombrar migraciones ya aplicadas.
ALTER TABLE "Siniestro" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
