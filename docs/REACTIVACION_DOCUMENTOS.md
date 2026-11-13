# Consulta y reactivación de documentos dados de baja

En la ficha de cada siniestro, Documentos muestra por defecto los activos. El filtro Mostrar documentos dados de baja incluye los retirados y se refleja como ?bajas=true en la URL. Las tarjetas conservan nombre, autor y fecha de carga; los retirados muestran estado, fecha, motivo y autor de la baja. Se pueden revisar imágenes/PDF y descargar archivos respetando el acceso al expediente.

Solo administradores y superadministrador pueden reactivar; la restricción se verifica nuevamente en el servidor con el rol vigente, después de bloquear el caso. Un caso cerrado, dado de baja o en eliminación es de solo lectura. Los gestores mantienen las restricciones existentes de baja: solo cargas propias dentro de 48 horas. Reactivar no renueva ese plazo.

La reactivación solicita confirmación, comprueba el archivo principal en R2 y revalida acceso/estado antes de guardar. Si falta el archivo o R2 no responde, no cambia la baja. Conserva las claves del archivo y derivados, autor y fecha de carga: no vuelve a subir nada. Limpia las marcas de la baja actual y agrega una reactivación en HistorialSiniestro (también se refleja en la actividad persistente del dashboard). El motivo de la baja anterior sigue en su evento histórico.

API: GET /api/siniestros/:id/documentos?bajas=true; PATCH /api/siniestros/:id/documentos/:idDocumento/reactivacion (cuerpo vacío). Los endpoints privados de visor/descarga admiten ?bajas=true para abrir retirados; sin ese parámetro siguen excluyéndolos. Este filtro no reemplaza la autorización del expediente.

No requiere migraciones, seeds ni cambios en Docker. La reactivación no se trata como una carga nueva ni modifica fechaUltimoMovimiento.

Verificar: dar de baja un documento de un caso de prueba, activar el filtro y revisar motivo/autor/fecha. Como administrador, confirmar Reactivar documento: vuelve al listado predeterminado y queda un evento en Historial. Como gestor, no debe ofrecer reactivación y la API debe responder 403 si se intenta directamente.
