-- CU-10 1.i (E5-09): cada evento del historial conserva quién lo hizo tal como era en ese momento (nombre y rol), aunque
-- después cambie su perfil o su rol. idUsuario sigue siendo la referencia al usuario.
--
-- Los completa la base al registrar el evento (trigger), con los datos del usuario en ese instante: así vale para
-- todas las operaciones que escriben historial, sin que cada una tenga que acordarse. Los eventos anteriores se
-- completan con los datos que el usuario tiene hoy: es lo más cercano que hay, porque antes no se guardaban.

ALTER TABLE "HistorialSiniestro" ADD COLUMN "autorNombre" TEXT;
ALTER TABLE "HistorialSiniestro" ADD COLUMN "autorTipoUsuario" "TipoUsuario";

UPDATE "HistorialSiniestro" h
SET "autorNombre" = u."nombres" || ' ' || u."apellidos",
    "autorTipoUsuario" = u."tipoUsuario"
FROM "Usuario" u
WHERE u."id" = h."idUsuario";

CREATE FUNCTION "historial_autor_al_registrar"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT COALESCE(NEW."autorNombre", u."nombres" || ' ' || u."apellidos"),
         COALESCE(NEW."autorTipoUsuario", u."tipoUsuario")
  INTO NEW."autorNombre", NEW."autorTipoUsuario"
  FROM "Usuario" u
  WHERE u."id" = NEW."idUsuario";
  RETURN NEW;
END $$;

CREATE TRIGGER "historial_autor_al_registrar"
  BEFORE INSERT ON "HistorialSiniestro"
  FOR EACH ROW EXECUTE FUNCTION "historial_autor_al_registrar"();
