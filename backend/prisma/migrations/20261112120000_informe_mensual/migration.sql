BEGIN;
CREATE TYPE "ResultadoCierre" AS ENUM ('ACUERDO_PAGO', 'RECHAZO', 'DESISTIMIENTO', 'DERIVACION_JUICIO');
ALTER TABLE "Siniestro" ADD COLUMN "montoReclamado" DECIMAL(16,2), ADD COLUMN "montoAcordado" DECIMAL(16,2), ADD COLUMN "moneda" VARCHAR(3) NOT NULL DEFAULT 'ARS', ADD COLUMN "resultadoCierre" "ResultadoCierre";
ALTER TABLE "Siniestro" ADD CONSTRAINT "Siniestro_importes_validos" CHECK (("montoReclamado" IS NULL OR "montoReclamado" >= 0) AND ("montoAcordado" IS NULL OR "montoAcordado" >= 0) AND "moneda" IN ('ARS','USD'));
CREATE TABLE "InformeMensual" (
  "id" UUID NOT NULL PRIMARY KEY, "clavePeriodo" TEXT NOT NULL UNIQUE, "periodo" VARCHAR(7) NOT NULL,
  "prueba" BOOLEAN NOT NULL DEFAULT false, "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
  "fechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "fechaActualizacion" TIMESTAMPTZ(3) NOT NULL,
  "datos" JSONB, "clavePdf" TEXT, "tamanoBytes" INTEGER, "correoEnviado" TIMESTAMPTZ(3), "destinatario" TEXT, "error" TEXT, "idSolicitante" INTEGER
);
CREATE INDEX "InformeMensual_periodo_fechaCreacion_idx" ON "InformeMensual"("periodo","fechaCreacion");
CREATE TABLE "RegistroEstadisticoSiniestro" (
  "id" BIGSERIAL PRIMARY KEY, "idSiniestro" INTEGER NOT NULL, "fechaRegistro" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  "fechaEvento" TIMESTAMPTZ(3) NOT NULL, "evento" TEXT NOT NULL, "idAutor" INTEGER, "datos" JSONB NOT NULL
);
CREATE INDEX "RegistroEstadisticoSiniestro_idSiniestro_fechaRegistro_id_idx" ON "RegistroEstadisticoSiniestro"("idSiniestro","fechaRegistro","id");
CREATE INDEX "RegistroEstadisticoSiniestro_fechaEvento_evento_idx" ON "RegistroEstadisticoSiniestro"("fechaEvento","evento");

-- Instantánea sin contenido de mensajes, direcciones, documentos ni identidades de las personas involucradas.
CREATE FUNCTION cova_datos_estadisticos(caso INTEGER) RETURNS JSONB LANGUAGE SQL STABLE AS $$
 SELECT jsonb_build_object(
  'id',s.id, 'numero',s."numeroSiniestro", 'ingreso',s."fechaAsignacion", 'ocurrencia',s."fechaOcurrencia",
  'estado', jsonb_build_object('id',e.id,'nombre',e.nombre,'cierre',e."esCierre"),
  'aseguradora',jsonb_build_object('id',a.id,'nombre',a.nombre),
  'ajustador',CASE WHEN j.id IS NULL THEN NULL ELSE jsonb_build_object('id',j.id,'nombre',concat_ws(' ',j.nombres,j.apellidos)) END,
  'gestor',jsonb_build_object('id',u.id,'nombre',concat_ws(' ',u.nombres,u.apellidos),'tipo',u."tipoUsuario"),
  'eliminado',s.eliminado,'fechaCierre',s."fechaCierre",'ultimoMovimiento',COALESCE(s."fechaUltimoMovimiento",s."fechaAsignacion"),
  'menores',s."menorEdadInvolucrado", 'moneda',s.moneda,'reclamado',s."montoReclamado"::text,'acordado',s."montoAcordado"::text,'resultado',s."resultadoCierre",
  'personas',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'lesion',p."tipoLesion",'abogado',p."idAbogado" IS NOT NULL AND NOT COALESCE(b.eliminado,true),'tercero',COALESCE(v."rolAccidente" = 'TERCERO',p."idVehiculo" IS NULL))) FROM "PersonaInvolucrada" p LEFT JOIN "Vehiculo" v ON v.id=p."idVehiculo" LEFT JOIN "Abogado" b ON b.id=p."idAbogado" WHERE p."idSiniestro"=s.id AND NOT p.eliminado AND (v.id IS NULL OR NOT v.eliminado)), '[]'::jsonb),
  'pericias',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'tipo',p."tipoPerito",'solicitud',p."fechaSolicitud",'cierre',p."fechaCierre",'eliminado',p.eliminado)) FROM "Perito" p WHERE p."idSiniestro"=s.id),'[]'::jsonb)
 ) FROM "Siniestro" s JOIN "EstadoSiniestro" e ON e.id=s."idEstadoSiniestro" JOIN "Aseguradora" a ON a.id=s."idAseguradora" JOIN "Usuario" u ON u.id=s."idUsuario" LEFT JOIN "Ajustador" j ON j.id=s."idAjustador" WHERE s.id=caso;
$$;
CREATE FUNCTION cova_registrar_estadistica(caso INTEGER, accion TEXT, autor INTEGER DEFAULT NULL, fecha TIMESTAMPTZ DEFAULT clock_timestamp()) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE datos JSONB;
BEGIN
 datos := cova_datos_estadisticos(caso);
 IF datos IS NOT NULL THEN
  IF autor IS NOT NULL THEN datos:=datos || jsonb_build_object('autorNombre',(SELECT concat_ws(' ',nombres,apellidos) FROM "Usuario" WHERE id=autor)); END IF;
  IF accion='ELIMINACION' THEN datos:=jsonb_set(datos,'{eliminado}','true'); END IF;
  INSERT INTO "RegistroEstadisticoSiniestro" ("idSiniestro","fechaEvento",evento,"idAutor",datos) VALUES(caso,fecha,accion,autor,datos);
 END IF;
END $$;
INSERT INTO "RegistroEstadisticoSiniestro" ("idSiniestro","fechaEvento",evento,datos) VALUES(0,clock_timestamp(),'INICIO','{}');
-- Punto inicial honesto: no inventa estados ni asignaciones anteriores a la instalación.
INSERT INTO "RegistroEstadisticoSiniestro" ("idSiniestro","fechaEvento",evento,datos) SELECT id,clock_timestamp(),'BASELINE',cova_datos_estadisticos(id) FROM "Siniestro";

CREATE FUNCTION cova_estadistica_caso() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN PERFORM cova_registrar_estadistica(OLD.id,'ELIMINACION'); RETURN OLD; END IF;
 IF TG_OP='INSERT' THEN PERFORM cova_registrar_estadistica(NEW.id,'ALTA');
 ELSIF (to_jsonb(NEW)-'revision'-'eliminacionEnCurso') IS DISTINCT FROM (to_jsonb(OLD)-'revision'-'eliminacionEnCurso') THEN PERFORM cova_registrar_estadistica(NEW.id,'DATOS'); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER estadistica_caso AFTER INSERT OR UPDATE ON "Siniestro" FOR EACH ROW EXECUTE FUNCTION cova_estadistica_caso();
CREATE TRIGGER estadistica_borrado BEFORE DELETE ON "Siniestro" FOR EACH ROW EXECUTE FUNCTION cova_estadistica_caso();
CREATE FUNCTION cova_estadistica_parte() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE fila JSONB;
BEGIN
 fila:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 PERFORM cova_registrar_estadistica((fila->>'idSiniestro')::integer,'PARTES');
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER estadistica_perito AFTER INSERT OR UPDATE OR DELETE ON "Perito" FOR EACH ROW EXECUTE FUNCTION cova_estadistica_parte();
CREATE TRIGGER estadistica_persona AFTER INSERT OR UPDATE OR DELETE ON "PersonaInvolucrada" FOR EACH ROW EXECUTE FUNCTION cova_estadistica_parte();
CREATE TRIGGER estadistica_vehiculo AFTER INSERT OR UPDATE OR DELETE ON "Vehiculo" FOR EACH ROW EXECUTE FUNCTION cova_estadistica_parte();
CREATE FUNCTION cova_estadistica_abogado() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE caso INTEGER;
BEGIN
 FOR caso IN SELECT DISTINCT "idSiniestro" FROM "PersonaInvolucrada" WHERE "idAbogado"=NEW.id LOOP PERFORM cova_registrar_estadistica(caso,'PARTES'); END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER estadistica_abogado AFTER UPDATE ON "Abogado" FOR EACH ROW EXECUTE FUNCTION cova_estadistica_abogado();
CREATE FUNCTION cova_estadistica_evento() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='HistorialSiniestro' THEN
  IF NEW."tipoEvento"::text IN ('CAMBIO_ESTADO','ASIGNACION','REASIGNACION','BAJA_SINIESTRO','REACTIVACION_SINIESTRO') THEN
   PERFORM cova_registrar_estadistica(NEW."idSiniestro",NEW."tipoEvento"::text,NEW."idUsuario",NEW."fechaEvento");
  END IF;
 ELSE
  PERFORM cova_registrar_estadistica(NEW."idSiniestro",CASE WHEN TG_TABLE_NAME='DocumentoSiniestro' THEN 'DOCUMENTO' ELSE 'NOVEDAD' END,NEW."idUsuario",NEW."fechaCarga");
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER estadistica_historial AFTER INSERT ON "HistorialSiniestro" FOR EACH ROW EXECUTE FUNCTION cova_estadistica_evento();
CREATE TRIGGER estadistica_documento AFTER INSERT ON "DocumentoSiniestro" FOR EACH ROW EXECUTE FUNCTION cova_estadistica_evento();
CREATE TRIGGER estadistica_novedad AFTER INSERT ON "NovedadSiniestro" FOR EACH ROW EXECUTE FUNCTION cova_estadistica_evento();
COMMIT;
