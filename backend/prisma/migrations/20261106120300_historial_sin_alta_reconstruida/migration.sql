-- CU-10 1.i (E5-09): el alta de los siniestros cargados antes de esta historia no se reconstruye.
--
-- Una versión anterior de esta rama (migración historial_alta_existentes, ya quitada) agregaba a esos siniestros un
-- alta deducida de su primera asignación, un milisegundo antes. Ese dato no demostraba ni la fecha ni el autor reales:
-- en las bases donde llegó a correr, se borran esas altas deducidas. Se reconocen por esa diferencia exacta de un
-- milisegundo con una asignación del mismo siniestro; las altas reales comparten la hora con su asignación.
-- En una base nueva no borra nada. La pestaña Historial avisa cuando un siniestro no tiene su alta registrada.

DELETE FROM "HistorialSiniestro" a
WHERE a."tipoEvento" = 'ALTA_SINIESTRO'
  AND EXISTS (
    SELECT 1 FROM "HistorialSiniestro" s
    WHERE s."idSiniestro" = a."idSiniestro"
      AND s."tipoEvento" = 'ASIGNACION'
      AND s."fechaEvento" = a."fechaEvento" + INTERVAL '1 millisecond'
  );
