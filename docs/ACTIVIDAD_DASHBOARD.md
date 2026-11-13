# Actividad que sobrevive al borrado del expediente

El dashboard administrativo ahora consulta ActividadSiniestro. Guarda una instantánea de descripción, tipo, número, autor y fecha de cada evento visible de HistorialSiniestro. Un trigger la registra en la misma transacción: alcanza a altas, asignaciones, cambios de estado, novedades, documentos, chat y partes sin duplicar lógica entre módulos.

El historial particular sigue perteneciendo al siniestro y se elimina junto con el expediente. La actividad del dashboard conserva sus instantáneas: no almacena archivos ni contenido de mensajes. La referencia para abrir la ficha usa ON DELETE SET NULL; el ID histórico y número se conservan sin depender de esa referencia. Un caso en eliminación tampoco desaparece de la actividad, pero su ficha deja de ofrecerse.

El borrado definitivo agrega un evento con autor y fecha en la misma transacción que borra los registros. Un fallo en R2 no agrega un evento de eliminación completada. Los reintentos de una eliminación completada no lo duplican. La actividad anterior conserva su fecha y autor aunque luego se modifique el perfil.

La migración 20261112200000_actividad_dashboard_persistente copia los eventos visibles todavía existentes. No reconstruye actividad de expedientes cuyo historial ya se borró antes de instalarla. No cambia Docker ni archivos de R2.

## Verificación manual

1. Crear un caso de prueba, registrar novedades o cambios de estado y revisar Actividad reciente / Ver historial completo.
2. Darlo de baja: los eventos previos y la baja deben seguir visibles.
3. Eliminarlo definitivamente desde un estado de cierre: el dashboard conserva lo anterior y agrega quién lo eliminó y cuándo.
4. Sus filas muestran Expediente no disponible y no navegan a una ficha eliminada. Los otros casos mantienen sus enlaces.
5. Si falla R2, el historial global se conserva y no anuncia una eliminación definitiva hasta completarla.

Pruebas automatizadas: dashboard-administrador.db.test.mjs y actividad-dashboard.db.test.mjs usan bases temporales; los objetos de R2 son simulados.
