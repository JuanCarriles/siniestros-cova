-- Incorporar a la migracion inicial DESPUES de CREATE TABLE.
-- Preparado sin ejecutar; no borra ni modifica registros.

ALTER TABLE "Pais" ADD CONSTRAINT "Pais_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "Provincia" ADD CONSTRAINT "Provincia_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "Direccion" ADD CONSTRAINT "Direccion_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "DocumentoPlantilla" ADD CONSTRAINT "DocumentoPlantilla_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "HistorialSiniestro" ADD CONSTRAINT "HistorialSiniestro_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "MensajeChat" ADD CONSTRAINT "MensajeChat_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "LecturaMensajeChat" ADD CONSTRAINT "LecturaMensajeChat_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "DocumentoSiniestro" ADD CONSTRAINT "DocumentoSiniestro_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "NovedadSiniestro" ADD CONSTRAINT "NovedadSiniestro_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "Perito" ADD CONSTRAINT "Perito_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "Aseguradora" ADD CONSTRAINT "Aseguradora_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "Ajustador" ADD CONSTRAINT "Ajustador_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "Abogado" ADD CONSTRAINT "Abogado_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "Vehiculo" ADD CONSTRAINT "Vehiculo_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "TipoDocumento" ADD CONSTRAINT "TipoDocumento_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "PersonaInvolucrada" ADD CONSTRAINT "PersonaInvolucrada_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "EstadoSiniestro" ADD CONSTRAINT "EstadoSiniestro_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

ALTER TABLE "Siniestro" ADD CONSTRAINT "Siniestro_baja_logica_check"
  CHECK (("eliminado" = false AND "fechaBaja" IS NULL)
      OR ("eliminado" = true AND "fechaBaja" IS NOT NULL));

