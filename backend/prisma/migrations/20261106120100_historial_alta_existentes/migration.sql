-- CU-10 1.i (E5-09): los siniestros cargados antes de esta historia no tienen el evento de alta. Se completa con su
-- primera asignación: en el alta, la asignación la registra quien crea el siniestro, en ese mismo momento. Va un
-- milisegundo antes, para que la línea de tiempo empiece por el alta.
--
-- El texto es el mismo que arma eventoHistorial.altaSiniestro: "Ana Ruiz dio de alta el siniestro el 03/11/2026",
-- con la fecha en hora argentina. Los siniestros sin ninguna asignación en el historial (por ejemplo, la carga de
-- volumen de prueba) quedan como están. Las partes cargadas en esas altas no se pueden reconstruir: no se agregan.

INSERT INTO "HistorialSiniestro" ("tipoEvento", "descripcion", "fechaEvento", "idSiniestro", "idUsuario")
SELECT
  'ALTA_SINIESTRO',
  u."nombres" || ' ' || u."apellidos" || ' dio de alta el siniestro el '
    || to_char(a."fechaEvento" AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY'),
  a."fechaEvento" - INTERVAL '1 millisecond',
  a."idSiniestro",
  a."idUsuario"
FROM (
  SELECT DISTINCT ON ("idSiniestro") "idSiniestro", "idUsuario", "fechaEvento"
  FROM "HistorialSiniestro"
  WHERE "tipoEvento" = 'ASIGNACION' AND NOT "eliminado"
  ORDER BY "idSiniestro", "fechaEvento", "id"
) a
JOIN "Usuario" u ON u."id" = a."idUsuario"
WHERE NOT EXISTS (
  SELECT 1 FROM "HistorialSiniestro" h
  WHERE h."idSiniestro" = a."idSiniestro" AND h."tipoEvento" = 'ALTA_SINIESTRO'
);
