-- Los casos sin responsable conservan el resto de sus datos y relaciones.
ALTER TABLE "Siniestro" ALTER COLUMN "idUsuario" DROP NOT NULL;
