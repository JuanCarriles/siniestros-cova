-- RF-19 (E5-10): casos demorados a las 72 horas.
--
-- 1. El semáforo se calcula al consultar, desde la fecha de último movimiento: la columna "demorado" no se leía en
--    ningún lado y quedaba desactualizada en cuanto pasaba el tiempo. Se borra.
-- 2. La tarea programada avisa con dos tipos de notificación: a las 72 horas sin movimiento (CASO_DEMORADO) y a los
--    7 días (CASO_EN_ALERTA). Se pueden agregar acá: esta migración no los usa.

ALTER TABLE "Siniestro" DROP COLUMN "demorado";

ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'CASO_DEMORADO';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'CASO_EN_ALERTA';
