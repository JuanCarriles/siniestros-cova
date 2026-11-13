# Agrupado de notificaciones del chat — E8-03

Rama feat/agrupar-notificaciones-chat, basada en desarrollo 56d1e5f. Referencias: CU-08, RF-29 y CU-10 1.h.1.1 / 1.h.3. Reutiliza la bandeja y el chat existentes, sin componentes visuales nuevos.

## Comportamiento

- Hay un solo aviso MENSAJE_NUEVO visible sin leer por siniestro y destinatario. Los siguientes mensajes actualizan el mismo ID, su fecha (la más reciente) y la descripción: «Tenés 20 mensajes sin leer en el siniestro N».
- El número es la cantidad real de mensajes de otros todavía no leídos por ese usuario, calculada desde MensajeChat y LecturaMensajeChat. No se agrega una columna con un contador que pueda desincronizarse. Cada aviso guarda la descripción de su última actualización; los avisos ya leídos no cambian de texto al llegar otro mensaje.
- La campana cuenta avisos, no mensajes: veinte mensajes pendientes de un mismo caso generan un aviso. Dos casos generan dos avisos. Cada participante tiene su propio grupo y contador.
- Solo participan el responsable actual y la administración activa, excluyendo a quien envió el mensaje y a quienes tienen esa conversación visible. Basta una pestaña visible del mismo usuario para evitar el aviso; si todas están ocultas o cerradas, se vuelve a notificar. La visibilidad usa la presencia que ya informa el chat por Socket.IO.
- Al abrir el chat, el flujo de lectura de E7-03 registra las lecturas y retira todos los avisos de mensajes de ese caso y usuario mediante baja lógica. No retira avisos de otros usuarios ni de otros casos.
- Leer un aviso desde la campana no equivale a leer sus mensajes: ese aviso queda leído, y el próximo mensaje puede generar un grupo nuevo. Su cantidad refleja todos los mensajes todavía sin leer de la conversación, no solo los posteriores a la apertura de la campana. Es la distinción de CU-08 y CU-10.
- Marcar un aviso antiguo como sin leer consolida cualquier otro grupo pendiente del mismo usuario y caso, preservando la fecha más reciente. Los otros avisos se retiran mediante baja lógica. Nunca se restauran avisos que ya habían sido eliminados del listado por leer el chat.
- Si la campana marca un aviso leído mientras llega otro mensaje, el envío verifica de nuevo que siga pendiente antes de actualizarlo. Si ya fue leído, crea un grupo nuevo; no vuelve a poner el viejo como no leído. Reintentar el mismo envío con su clave no duplica mensajes ni incrementa el contador.
- No se envían correos de mensajes de chat. Se conserva la privacidad de la conversación: el aviso no contiene su texto.

## Base de datos

La migración 20261111190000_aviso_chat_pendiente_unico agrega el índice único parcial Notificacion_chat_pendiente_unico sobre (idUsuario, idSiniestro), solo para MENSAJE_NUEVO con eliminado=false y leida=false. Antes consolida duplicados pendientes existentes: conserva el más reciente y retira los otros con fecha de baja. No borra mensajes ni lecturas ni elimina físicamente notificaciones.

No se agregan tablas, columnas ni dependencias. El esquema Prisma documenta el índice parcial, declarado mediante SQL como los otros índices especiales del proyecto. El envío y la lectura conservan su bloqueo por siniestro; marcar sin leer un aviso de chat usa ese mismo orden para respetar el índice.

No se modificó Docker ni se ejecutaron seeds. En Docker, el servicio migrate ya existente aplica la migración durante docker compose up -d --build. En ejecución local, aplicar las migraciones pendientes con npm run prisma:migrate:deploy -w backend antes de iniciar el backend actualizado.

## Pruebas

npm run test:chat:agrupado:db -w backend crea y elimina su propia base temporal. Prueba HTTP y Socket.IO reales: ráfaga de veinte mensajes, contador y fecha, idempotencia, aislamiento por destinatario/caso, lectura del aviso frente a lectura del chat, dos pestañas con distinta visibilidad, lectura simultánea con agrupado, marcado manual de un aviso antiguo, índice único y consolidación de duplicados previos. Sin mails ni archivos externos.

Mantener además las pruebas de E8-01/E8-02, chat-mensajes, chat-leidos, migraciones y el frontend. La migración nueva se aplica solo en las bases temporales durante la verificación; los datos del usuario permanecen intactos.

Prueba manual: con el destinatario fuera del chat, enviar varios mensajes desde otra cuenta; abrir la campana y comprobar un solo aviso con la cantidad y la fecha actualizadas. Entrar desde el aviso al chat: al completar la lectura debe desaparecer de la bandeja del destinatario. Mantener el chat visible y enviar otro mensaje: debe llegar a la conversación sin crear un aviso; ocultar la pestaña y repetir: debe crear un aviso pendiente.
