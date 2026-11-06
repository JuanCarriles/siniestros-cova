-- CU-10 1.f (E5-08): la autoría de cada novedad es la de ese momento.
--
-- 1. tipoUsuarioAutor: el rol de quien la cargó al cargarla. Las anteriores quedan vacías: ese dato no se registraba
--    y no se inventa (la ficha dice "rol no registrado").
-- 2. claveEnvio: identificador de cada envío del formulario, para no cargar dos veces la misma novedad si se reintenta.
-- 3. Corrige la migración novedades_autor, que atribuyó cada novedad anterior al responsable actual del siniestro: si el
--    caso se había reasignado, quedaba a nombre de otra persona. El autor confiable es el nombre guardado ("autor").
--    La novedad queda vinculada a un usuario solo si ese nombre es el suyo o el de un único usuario; si no coincide con
--    nadie o con varios, queda sin usuario. Las que ya coinciden no se tocan.

ALTER TABLE "NovedadSiniestro" ALTER COLUMN "idUsuario" DROP NOT NULL;
ALTER TABLE "NovedadSiniestro" ADD COLUMN "tipoUsuarioAutor" "TipoUsuario";
ALTER TABLE "NovedadSiniestro" ADD COLUMN "claveEnvio" TEXT;
CREATE UNIQUE INDEX "NovedadSiniestro_claveEnvio_key" ON "NovedadSiniestro"("claveEnvio");

UPDATE "NovedadSiniestro" n
SET "idUsuario" = (
  SELECT CASE WHEN count(*) = 1 THEN min(u."id") END
  FROM "Usuario" u
  WHERE u."nombres" || ' ' || u."apellidos" = n."autor"
)
WHERE NOT EXISTS (
  SELECT 1 FROM "Usuario" u
  WHERE u."id" = n."idUsuario" AND u."nombres" || ' ' || u."apellidos" = n."autor"
);
