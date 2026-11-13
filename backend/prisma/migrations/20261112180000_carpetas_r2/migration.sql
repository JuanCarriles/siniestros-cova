BEGIN;
-- Aditiva. No mueve archivos remotos ni cambia referencias existentes.
ALTER TABLE "Siniestro" ADD COLUMN "carpetaR2" TEXT;
CREATE UNIQUE INDEX "Siniestro_carpetaR2_key" ON "Siniestro"("carpetaR2");

-- Reservar una carpeta es infraestructura, no actividad del expediente para el informe mensual.
CREATE OR REPLACE FUNCTION cova_estadistica_caso() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN PERFORM cova_registrar_estadistica(OLD.id,'ELIMINACION'); RETURN OLD; END IF;
 IF TG_OP='INSERT' THEN PERFORM cova_registrar_estadistica(NEW.id,'ALTA');
 ELSIF (to_jsonb(NEW)-'revision'-'eliminacionEnCurso'-'carpetaR2') IS DISTINCT FROM
       (to_jsonb(OLD)-'revision'-'eliminacionEnCurso'-'carpetaR2') THEN
   PERFORM cova_registrar_estadistica(NEW.id,'DATOS');
 END IF;
 RETURN NEW;
END $$;

COMMIT;
