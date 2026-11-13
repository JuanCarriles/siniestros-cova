BEGIN;
-- Registro del dashboard independiente del expediente y de su historial particular.
CREATE TABLE "ActividadSiniestro" (
 "id" SERIAL NOT NULL PRIMARY KEY,
 "idHistorial" INTEGER,
 "idSiniestroReferencia" INTEGER NOT NULL,
 "numeroSiniestro" TEXT NOT NULL,
 "tipoEvento" TEXT NOT NULL,
 "descripcion" TEXT NOT NULL,
 "fechaEvento" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "idAutor" INTEGER,
 "autorNombre" TEXT NOT NULL,
 "autorTipoUsuario" "TipoUsuario",
 "idSiniestro" INTEGER,
 CONSTRAINT "ActividadSiniestro_idSiniestro_fkey" FOREIGN KEY ("idSiniestro") REFERENCES "Siniestro"("id") ON DELETE SET NULL ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "ActividadSiniestro_idHistorial_key" ON "ActividadSiniestro"("idHistorial");
CREATE INDEX "ActividadSiniestro_fechaEvento_id_idx" ON "ActividadSiniestro"("fechaEvento","id");
CREATE INDEX "ActividadSiniestro_idSiniestroReferencia_idx" ON "ActividadSiniestro"("idSiniestroReferencia");
CREATE INDEX "ActividadSiniestro_idSiniestro_idx" ON "ActividadSiniestro"("idSiniestro");

-- Evita perder eventos que se estén registrando entre el copiado inicial y la instalación del trigger.
LOCK TABLE "HistorialSiniestro" IN SHARE ROW EXCLUSIVE MODE;

-- Copia las instantáneas ya existentes: no inventa eventos de expedientes eliminados antes de esta migración.
INSERT INTO "ActividadSiniestro" ("idHistorial","idSiniestroReferencia","numeroSiniestro","tipoEvento","descripcion","fechaEvento","idAutor","autorNombre","autorTipoUsuario","idSiniestro")
SELECT h.id,h."idSiniestro",s."numeroSiniestro",h."tipoEvento"::text,h.descripcion,h."fechaEvento",h."idUsuario",
       COALESCE(h."autorNombre",u.nombres || ' ' || u.apellidos),COALESCE(h."autorTipoUsuario",u."tipoUsuario"),s.id
FROM "HistorialSiniestro" h JOIN "Siniestro" s ON s.id=h."idSiniestro" JOIN "Usuario" u ON u.id=h."idUsuario"
WHERE NOT h.eliminado ORDER BY h."fechaEvento",h.id;

-- AFTER INSERT toma el nombre/rol histórico que el trigger del historial ya completó.
CREATE FUNCTION actividad_siniestro_al_registrar() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO "ActividadSiniestro" ("idHistorial","idSiniestroReferencia","numeroSiniestro","tipoEvento","descripcion","fechaEvento","idAutor","autorNombre","autorTipoUsuario","idSiniestro")
 SELECT NEW.id,NEW."idSiniestro",s."numeroSiniestro",NEW."tipoEvento"::text,NEW.descripcion,NEW."fechaEvento",NEW."idUsuario",
        COALESCE(NEW."autorNombre",u.nombres || ' ' || u.apellidos),COALESCE(NEW."autorTipoUsuario",u."tipoUsuario"),s.id
 FROM "Siniestro" s JOIN "Usuario" u ON u.id=NEW."idUsuario" WHERE s.id=NEW."idSiniestro";
 RETURN NEW;
END $$;
CREATE TRIGGER actividad_siniestro_al_registrar AFTER INSERT ON "HistorialSiniestro"
FOR EACH ROW WHEN (NOT NEW.eliminado) EXECUTE FUNCTION actividad_siniestro_al_registrar();
COMMIT;
