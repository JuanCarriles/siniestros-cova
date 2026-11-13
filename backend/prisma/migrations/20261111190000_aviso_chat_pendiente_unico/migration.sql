-- Un único aviso visible SIN LEER por conversación y destinatario.
-- Se conserva el más reciente; los duplicados históricos se retiran sin borrar mensajes ni lecturas.
BEGIN;
WITH ordenadas AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "idUsuario", "idSiniestro" ORDER BY "fechaCreacion" DESC, "id" DESC
  ) AS orden
  FROM "Notificacion"
  WHERE "tipoNotificacion" = 'MENSAJE_NUEVO' AND NOT "eliminado" AND NOT "leida"
)
UPDATE "Notificacion" AS n SET "eliminado" = true, "fechaBaja" = CURRENT_TIMESTAMP
FROM ordenadas AS o WHERE n."id" = o."id" AND o.orden > 1;

CREATE UNIQUE INDEX "Notificacion_chat_pendiente_unico"
ON "Notificacion" ("idUsuario", "idSiniestro")
WHERE "tipoNotificacion" = 'MENSAJE_NUEVO' AND NOT "eliminado" AND NOT "leida";
COMMIT;
