# Notificaciones por evento — E8-02 / CU-08

Rama `feat/generar-notificaciones-evento`, sobre E8-01. Referencia: RF-29 y CU-08 del PDF; agrupación de mensajes según CU-10 1.h.1.1. No cambia el diseño de la bandeja, Docker, las credenciales ni el esquema de la base.

## Eventos conectados

| Evento | Bandeja interna | Correo |
| --- | --- | --- |
| Alta/asignación de siniestro | Usuario asignado | Usuario asignado |
| Reasignación | Anterior y nuevo responsable activos | Solo nuevo responsable |
| Cambio de estado | Asignado y administración activa, excepto autor | No |
| Novedad | Asignado y administración activa, excepto autor | No |
| Documento y demora (ya existentes) | Conservan sus destinatarios y reglas | No |
| Recuperación de contraseña | Flujo existente | Código de recuperación |
| Cambio de contraseña | Flujo existente | Se conserva el aviso de seguridad, por decisión expresa del equipo |

Los avisos internos se guardan en la misma transacción que el evento. Si falla la operación no se registra el aviso; si falla guardar el aviso se revierte la operación. Los destinatarios provienen de la base, no del formulario. Un administrador asignado recibe un solo aviso. Los eventos de estado y novedades se agregan: no se sobrescribe el historial de avisos anteriores. El reintento de una novedad con la misma clave no duplica el evento ni los avisos.

Los correos de asignación/reasignación se envían después del commit; un fallo de Resend no deshace la operación y se informa al cliente. No hay reintento automático de correo: no repetir el cambio para reenviarlo. Nunca se incluyen credenciales en los logs.

El responsable anterior conserva la notificación de reasignación sin recibir acceso al expediente. La pantalla de confirmación explica que solo el nuevo responsable recibe mail.

## Integraciones preparadas, pendientes de sus módulos

Por decisión del equipo no se implementa el chat ni un flujo de activación en esta historia.

- `notificarMensajeNuevo(tx, idMensaje)` está preparado y probado. El futuro servicio de chat debe llamarlo en la misma transacción que guarda el mensaje, después de validar los permisos del envío. Obtiene el autor, fecha, caso y destinatarios de la base; excluye al autor y usuarios inactivos. Agrupa los mensajes nuevos en un aviso no leído por usuario y siniestro, actualizando su fecha y devolviéndolo a sin revisar. Si el aviso anterior ya fue leído, conserva ese aviso y crea uno nuevo. No envía mail ni incluye el contenido privado del mensaje en la notificación. La presencia en tiempo real, no avisar a participantes que están dentro de la conversación y retirar el aviso al leer el chat quedan a cargo de la futura historia de chat. No hay endpoint nuevo ni envío de mensajes disponible en esta rama.

El criterio de mensaje nuevo está preparado técnicamente, pero todavía no se puede verificar desde la aplicación en esta rama. El correo de activación se agregará cuando exista esa historia; se quitó la implementación sin uso. La excepción del correo de seguridad fue confirmada por el equipo.

## Verificación

- `npm run test:eventos:db -w backend`: base temporal separada, migraciones, asignación, reasignación, estados, novedades, privacidad, deduplicación, rollback y agrupación concurrente del hook de chat. Sin correos ni archivos reales.
- Mantener las pruebas de estado, reasignación, recuperación, perfil y bandeja.

Prueba manual: dos cuentas, una administrativa y otra asignada al caso. Crear un caso verifica asignación; reasignarlo verifica aviso interno para ambos y correo solo para el nuevo. Cambiar estado o cargar una novedad debe avisar en la bandeja al asignado y administración activa, excluyendo autor, sin mail. La campana consulta su resumen al volver a la pestaña, al marcar avisos o en su consulta periódica; esta historia no agrega entrega en tiempo real.


## Correcciones de revisión E8-02

- Incorporadas las correcciones de E8-01 (af4f997): escrituras con ReadCommitted, consultas coherentes, lista disponible si falla el marcado y mejoras de accesibilidad. No se configura RepeatableRead para los marcados.
- El servicio conserva el filtro de destinatario del mail por nuevo.id. El contrato AvisoReasignacion ya no tiene esNuevoResponsable; el enlace es siempre /siniestros/:id. La prueba del servicio asegura que el anterior no recibe correo y ambos mantienen su aviso interno.
- Eliminados el mailer de activación sin consumidores, sus pruebas y el comando test:eventos que solo ejecutaba esas pruebas retiradas. Se conservan test:eventos:db y las pruebas del correo de reasignación, recuperación y cambio de contraseña.
- Ordenados los imports internos. Se mantienen sin cambios eventos-notificaciones.ts y notificaciones-mensaje.ts para conservar la integración con las ramas del chat; el procesamiento por destinatario sigue siendo adecuado para el equipo actual.
- Abrir la campana marca los avisos mostrados como leídos. Si luego llega otro mensaje, genera un nuevo aviso cuando ya no hay uno sin leer; es la agrupación indicada por CU-10 1.h.1.1, no un duplicado accidental.
- Orden de integración: E8-01, E8-02 y luego feat/chat-tiempo-real, feat/chat-mensajes y feat/chat-leidos. Esta corrección no modifica ni integra esas ramas del chat.
