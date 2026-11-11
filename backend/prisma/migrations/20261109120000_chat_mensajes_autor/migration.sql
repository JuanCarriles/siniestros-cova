-- CU-10 1.h (E7-02): mensajes del chat del siniestro.
--
-- 1. autor y tipoUsuarioAutor: nombre y rol de quien lo envió, tal como eran en ese momento (igual que las
--    novedades): la conversación no cambia si después se edita el perfil o el rol. Los mensajes anteriores (solo
--    datos de prueba: el chat no existía) toman los datos actuales de su usuario.
-- 2. claveEnvio: identificador de cada envío del formulario, para no guardar dos veces el mismo mensaje si se
--    reintenta después de perder la respuesta.

ALTER TABLE "MensajeChat" ADD COLUMN "autor" TEXT;
ALTER TABLE "MensajeChat" ADD COLUMN "tipoUsuarioAutor" "TipoUsuario";
ALTER TABLE "MensajeChat" ADD COLUMN "claveEnvio" TEXT;

UPDATE "MensajeChat" m
SET "autor" = u."nombres" || ' ' || u."apellidos", "tipoUsuarioAutor" = u."tipoUsuario"
FROM "Usuario" u
WHERE u."id" = m."idUsuario";

ALTER TABLE "MensajeChat" ALTER COLUMN "autor" SET NOT NULL;
CREATE UNIQUE INDEX "MensajeChat_claveEnvio_key" ON "MensajeChat"("claveEnvio");
