-- Unifica solamente duplicados equivalentes y conserva todos los expedientes y vehículos.
-- Si hay datos incompatibles o colisiones de números, se detiene sin cambiar nada.
BEGIN;
LOCK TABLE "Aseguradora", "Ajustador", "Siniestro", "Vehiculo" IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Aseguradora" GROUP BY lower(btrim(nombre))
    HAVING count(*) > 1 AND count(DISTINCT eliminado) > 1
  ) THEN
    RAISE EXCEPTION 'Hay aseguradoras repetidas con estados distintos. Revisarlas antes de unificar; no se modificó ningún dato.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Ajustador" j JOIN "Aseguradora" a ON a.id = j."idAseguradora"
    GROUP BY lower(btrim(j.email))
    HAVING count(*) > 1 AND count(DISTINCT (j.nombres, j.apellidos, j.telefono, j.eliminado, lower(btrim(a.nombre)))) > 1
  ) THEN
    RAISE EXCEPTION 'Hay ajustadores con el mismo email y datos distintos. Revisarlos antes de unificar; no se modificó ningún dato.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Siniestro" s JOIN "Aseguradora" a ON a.id = s."idAseguradora"
    GROUP BY lower(btrim(a.nombre)), lower(s."numeroSiniestro") HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Unificar las aseguradoras repetiría números de siniestro. Revisarlos antes de continuar; no se modificó ningún dato.';
  END IF;
END $$;

CREATE TEMP TABLE aseguradoras_unificadas ON COMMIT DROP AS
  SELECT id, min(id) OVER (PARTITION BY lower(btrim(nombre))) destino FROM "Aseguradora";
CREATE TEMP TABLE ajustadores_unificados ON COMMIT DROP AS
  SELECT id, min(id) OVER (PARTITION BY lower(btrim(email))) destino FROM "Ajustador";

UPDATE "Siniestro" s SET "idAjustador" = m.destino
FROM ajustadores_unificados m WHERE s."idAjustador" = m.id AND m.id <> m.destino;
DELETE FROM "Ajustador" j USING ajustadores_unificados m WHERE j.id = m.id AND m.id <> m.destino;

UPDATE "Ajustador" j SET "idAseguradora" = m.destino
FROM aseguradoras_unificadas m WHERE j."idAseguradora" = m.id AND m.id <> m.destino;
UPDATE "Siniestro" s SET "idAseguradora" = m.destino
FROM aseguradoras_unificadas m WHERE s."idAseguradora" = m.id AND m.id <> m.destino;
UPDATE "Vehiculo" v SET "idAseguradora" = m.destino
FROM aseguradoras_unificadas m WHERE v."idAseguradora" = m.id AND m.id <> m.destino;
DELETE FROM "Aseguradora" a USING aseguradoras_unificadas m WHERE a.id = m.id AND m.id <> m.destino;

-- Incluye las bajas: se reactiva el registro existente en vez de crear otro con la misma identidad.
CREATE UNIQUE INDEX "Aseguradora_nombre_normalizado_key" ON "Aseguradora" (lower(btrim(nombre)));
CREATE UNIQUE INDEX "Ajustador_email_normalizado_key" ON "Ajustador" (lower(btrim(email)));
COMMIT;
