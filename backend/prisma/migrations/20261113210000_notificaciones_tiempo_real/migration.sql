BEGIN;
-- NOTIFY se entrega únicamente después del COMMIT. Un rollback no genera avisos.
-- El canal lleva solo el destinatario y si hay contenido nuevo; la bandeja se consulta por API autenticada.
CREATE FUNCTION cova_avisar_cambio_notificacion() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE nueva BOOLEAN;
BEGIN
 IF TG_OP='DELETE' THEN
   PERFORM pg_notify('cova_notificaciones',json_build_object('idUsuario',OLD."idUsuario",'nueva',false)::text);
   RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
   IF NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
   IF NEW."idUsuario" IS DISTINCT FROM OLD."idUsuario" THEN
     PERFORM pg_notify('cova_notificaciones',json_build_object('idUsuario',OLD."idUsuario",'nueva',false)::text);
   END IF;
   nueva := NOT NEW.eliminado AND NOT NEW.leida AND (
     OLD.eliminado OR OLD.leida OR NEW."idUsuario" IS DISTINCT FROM OLD."idUsuario" OR
     (NEW.mensaje,NEW."fechaCreacion",NEW."tipoNotificacion",NEW."idSiniestro") IS DISTINCT FROM
     (OLD.mensaje,OLD."fechaCreacion",OLD."tipoNotificacion",OLD."idSiniestro")
   );
 ELSE
   nueva := NOT NEW.eliminado AND NOT NEW.leida;
 END IF;
 PERFORM pg_notify('cova_notificaciones',json_build_object('idUsuario',NEW."idUsuario",'nueva',nueva)::text);
 RETURN NEW;
END $$;
CREATE TRIGGER notificacion_cambio_tiempo_real AFTER INSERT OR UPDATE OR DELETE ON "Notificacion"
FOR EACH ROW EXECUTE FUNCTION cova_avisar_cambio_notificacion();
COMMIT;
