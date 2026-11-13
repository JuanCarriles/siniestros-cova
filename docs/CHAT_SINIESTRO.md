# Chat del siniestro (E7-01, E7-02 y E7-03, CU-10 1.h)

## E7-01: conexión en tiempo real

### Cómo funciona

- **Servidor:** Socket.IO montado sobre el mismo servidor HTTP de la API, en `/socket.io`
  (`backend/src/modules/chat/tiempo-real.ts`, se monta desde `server.ts`).
- **Autenticación:** el handshake lee la cookie de sesión `cova_sesion`, la misma httpOnly de la API, y la valida
  con el servicio de sesiones. Sin sesión vigente, la conexión se rechaza con `connect_error`
  (`data.codigo = 'SESION_VENCIDA'`) y el navegador vuelve al login. Una conexión abierta sin actividad **no**
  renueva la sesión: el vencimiento por inactividad de 7 h (RNF-08) se mantiene.
- **Mismo sitio:** no hay CORS. Un handshake con `Origin` de otro sitio se rechaza.
- **Una sala por siniestro** (`siniestro:<id>`). El navegador pide entrar con `sala:unirse`. Antes de unir, el
  servidor controla el acceso en la base, con el rol y el responsable vigentes, igual que la ficha: el gestor,
  solo sus casos; la administración, todos. Responde con `{ ok: true }` o `{ ok: false, status, error }`.

### Perder el acceso con el chat abierto

| Qué pasa                                                         | Cuándo se corta                                 |
| ---------------------------------------------------------------- | ----------------------------------------------- |
| Reasignación, baja o eliminación del siniestro                   | En el momento (la ruta llama a `revisarSala`)   |
| Cambio de rol o baja del usuario, cambio de contraseña           | En el momento (`revisarUsuario`)                |
| Logout                                                           | En el momento, solo esa sesión (`cerrarSesion`) |
| Cualquier otro caso (sesión vencida, recuperación de contraseña) | Revisión periódica, cada 30 s                   |

Además, **antes de cada envío a una sala** (`emitirASala`) se revisa a cada conectado. Así el contenido del
caso nunca le llega a quien ya no tiene acceso, aunque no haya pasado la revisión periódica. El que pierde la
sala recibe `sala:expulsado`; el que pierde la sesión, `sesion:vencida`. Si la revisión de una conexión falla (por
ejemplo, la base no responde), esa conexión **no recibe** el envío: ante la duda, no se manda. Sigue en la sala y la
próxima revisión decide.

### Navegador

`frontend/src/lib/tiempo-real.ts` mantiene una única conexión por pestaña. Se abre con la primera sala y se
cierra 10 s después de salir de la última. Si se corta la red o se reinicia el servidor, Socket.IO reintenta
solo con espera creciente. Al volver, se reincorpora a las salas abiertas y avisa a las pantallas
(`onReconectado`) para que pidan lo que llegó mientras tanto. El evento `offline` del navegador muestra la
pérdida al instante, sin esperar al latido de Socket.IO (unos 45 s).

La pestaña Chat muestra siempre el estado de la conexión con texto e ícono, no solo con color
(`estado-conexion-chat.tsx`). La pérdida de conexión se anuncia con `role="alert"`.

El apagado del servidor corta los transportes sin mandar un "desconectado por el servidor", porque en ese caso
el cliente no reintentaría y después de un deploy el chat quedaría muerto hasta recargar la página.

### Nginx

`frontend/nginx/snippets/app.conf` deriva `/socket.io/` al backend con `proxy_http_version 1.1`,
`Upgrade $http_upgrade`, `Connection "upgrade"` y `proxy_read_timeout 1h`. En desarrollo, el proxy de Vite hace
lo mismo (`ws: true`).

Con una sola instancia del backend no hace falta un adaptador (Redis). Si algún día hay más de una, Socket.IO
necesita el adaptador y sesiones "pegajosas" en Nginx.

### Pruebas

- `npm run test:chat -w backend`: lectura de la cookie y control de origen.
- `npm run test:chat:db -w backend`: base temporal, Socket.IO real sobre HTTP real. Cubre:
  - sin cookie, sesión inventada y otro sitio;
  - la conexión no renueva la sesión;
  - unirse a un caso propio, ajeno (403), inexistente (404) e inválido (400);
  - la administración entra a cualquier sala;
  - reasignación con expulsión inmediata;
  - cambio de rol detectado antes de un envío;
  - sesión borrada (revisión periódica) y logout de una sola sesión;
  - **reconexión cortando la red**, con un proxy TCP que corta las conexiones y rechaza los reintentos hasta
    que se restablece;
  - reconexión después del apagado del servidor.

#### Prueba manual

1. Entrar como gestor a la ficha de un caso propio, pestaña Chat: debe decir "Conectado".
2. Cortar el backend (o la red del equipo): aparece "Se perdió la conexión con el chat…". Al volver, sin
   recargar, vuelve a "Conectado".
3. Con Docker: lo mismo por `https://<dominio>/` (Nginx). En las herramientas del navegador, la conexión
   `/socket.io/?EIO=4&transport=websocket` debe responder `101 Switching Protocols`.

## E7-02: enviar y recibir mensajes

Chat grupal del siniestro entre el gestor asignado y la administración: administradores y superadministradores
activos (RF-25).

### API

- `GET /api/siniestros/:id/chat`: la conversación, del mensaje más viejo al más nuevo. Devuelve
  `{ mensajes, soloLectura }`.
- `GET /api/siniestros/:id/chat?despues=<id>`: solo lo posterior a ese mensaje. Desde E7-03 el navegador recarga
  la conversación entera cada vez que se une a la sala (al entrar y al reconectar), porque mientras tanto también
  pudieron leerse mensajes viejos (CU-10 1.h.2).
- `POST /api/siniestros/:id/chat` con `{ texto, claveEnvio }`: envía un mensaje y responde con el mensaje guardado.
  - El texto va de 1 a 2000 caracteres; se valida con el mismo esquema en el formulario y en el servidor.
  - El autor, la fecha y el siniestro no vienen del navegador.
  - `claveEnvio` es un UUID por mensaje: un reintento con la misma clave devuelve el mismo mensaje, sin duplicar
    historial ni avisos.
- No hay rutas para editar ni borrar mensajes (RF-27). Los mensajes solo se van con el borrado físico del
  siniestro.

### Al enviar (una transacción)

1. `prepararEdicion`: bloquea el siniestro, toma el rol y el responsable vigentes en la base y rechaza un caso
   cerrado o dado de baja (409).
2. Se guarda el mensaje con su autor, nombre y rol de ese momento (no cambian si después se edita el perfil), y la
   fecha y hora del servidor.
3. Se registra una línea `MENSAJE` en el historial.
4. Se avisa con `notificarMensajeNuevo` (de E8-02) a los participantes activos, menos el autor y menos **quienes
   tienen la conversación a la vista**: tienen abierta la pestaña Chat de la ficha, con la pestaña del navegador visible
   (`sala:atencion`: el navegador lo informa al unirse y cada vez que la pestaña se oculta o vuelve a la vista). Si ya tenían un aviso de mensajes nuevos sin leer en ese siniestro, se actualiza su fecha
   en lugar de crear otro (CU-10 1.h.1.1). El aviso no incluye el texto del mensaje.

Después del commit, el mensaje se reparte a la sala (`chat:mensaje`), revisando antes el acceso de cada
conectado. Si el reparto falla, el mensaje igual quedó guardado y los demás lo reciben al reconectar.

Mandar un mensaje no es movimiento del caso: no reinicia los días sin movimiento (regla de E5-10).

### Migración

`20261109120000_chat_mensajes_autor` agrega a `MensajeChat` las columnas `autor` (obligatoria),
`tipoUsuarioAutor` y `claveEnvio` (única). Los mensajes anteriores (solo datos de prueba, porque el chat no
existía) toman el nombre y el rol actuales de su usuario.

### Pantalla (pestaña Chat)

- Del mensaje más viejo arriba al más nuevo abajo, junto al cuadro para escribir, con separadores por día
  ("Hoy", "Ayer", "Domingo, 25 de octubre de 2026").
- Cada mensaje muestra autor, rol y hora. Los propios dicen "Vos" y van a la derecha, con otro fondo y el borde
  naranja del lado derecho: se distinguen sin depender del color.
- El cuadro de texto usa React Hook Form con el esquema compartido. Enter envía y Shift+Enter baja
  de línea; mientras se compone un carácter (acentos, otros idiomas) Enter no envía. En pantallas táctiles sin
  teclado (no hay Shift) Enter baja de línea y se envía con el botón.
- Al enviar, el mensaje aparece como "Enviando…" y el cuadro queda libre para el siguiente. Si falla, queda
  "No se envió", con el motivo y los botones Reintentar (usa la misma clave, así que no duplica) y Descartar.
- Un mensaje sin confirmar queda **en su lugar de la conversación**: justo después del mensaje que era el último
  cuando se escribió (`lineaDeTiempo` en `chat.ts`; no depende del reloj del equipo). Lo que llega después, por
  ejemplo de otros mientras no había conexión, aparece debajo y a la vista. Al confirmarse, toma la hora del
  servidor y pasa al final.
- Si falló por la conexión o por el servidor (sin respuesta, 408, 429, 5xx), dice "Se va a reenviar solo cuando
  vuelva la conexión" y se reenvía solo al reconectar, de a uno y en orden. Un rechazo (403, 409…) no se reenvía
  solo: muestra el motivo.
- Los mensajes de otros se anuncian al lector de pantalla ("Mensaje nuevo de …").
- Si estás leyendo más arriba, la vista no salta: aparece el botón "N mensajes nuevos".
- La pérdida de conexión se avisa arriba. Mientras tanto se puede seguir enviando, porque el envío va por HTTP.
- Cerrado o dado de baja: en lugar del cuadro para escribir, un aviso de solo lectura.

### Pruebas

- `npm run test:chat:mensajes:db -w backend`: HTTP y Socket.IO reales sobre una base temporal. Cubre:
  - el esquema;
  - el envío con autor, el historial, y que no es movimiento;
  - la entrega en tiempo real a la sala, y que no llega a un gestor de otro caso;
  - los avisos sin el autor ni quien está mirando, el aviso cuando la pestaña queda en segundo plano y la
    agrupación;
  - el orden cronológico y el `despues`;
  - la idempotencia y la clave usada por otro (409);
  - que el nombre guardado no cambia al editar el perfil;
  - permisos (403, 404, 401);
  - cerrado y dado de baja en solo lectura;
  - que no existen rutas para editar ni borrar.
- `npm run test:design -w frontend` incluye `chat.test.mjs`: la conversación sin repetidos y en orden.

## E7-03: indicador de mensaje leído (RF-26, CU-10 1.h.3)

- `POST /api/siniestros/:id/chat/leidos`: marca como leídos los mensajes de otros que el usuario todavía no leyó.
  - Bloquea el siniestro antes de todo (`FOR NO KEY UPDATE`), igual que el envío. Así un mensaje no puede llegar
    entre que se buscan los pendientes y se retira el aviso (se borraría el aviso de un mensaje que quedó sin
    leer), y dos pestañas que marcan a la vez van una detrás de otra.
  - Guarda una fila en `LecturaMensajeChat` por mensaje, con el usuario y la hora del servidor. El índice único
    (mensaje, usuario) y `skipDuplicates` quedan de resguardo. La respuesta y el aviso a la sala salen de las
    lecturas que quedaron guardadas, no de las que se intentaron.
  - En la misma transacción retira de la bandeja el aviso de mensajes nuevos de ese siniestro (baja lógica:
    `eliminado` y `fechaBaja`). El próximo mensaje vuelve a generar un aviso.
  - Responde `{ leidos, avisosRetirados, lecturas }`. Si marcó algo, después del commit avisa a la sala con
    `chat:leido` (`{ idSiniestro, idsMensajes, lector, fechaLeido }`).
  - Se puede leer también en un caso cerrado o dado de baja. El autor no "lee" sus propios mensajes.
- Cada mensaje trae `leidoPor`: quién lo leyó y cuándo, en orden, sin contar al autor.
- **Cuándo se marca:** al entrar a la conversación (aunque no haya nada pendiente: así se retira un aviso que
  haya quedado) y cada vez que aparece algo sin leer mientras la conversación está a la vista, con la pestaña
  del navegador visible. Si la pestaña está oculta, se marca al volver. Lo decide `marcado-leido.ts` (sin React,
  con pruebas propias): un pedido por vez; si llega algo mientras hay uno en curso, otra pasada al terminar; si
  falla, reintenta solo cada 1 s, 2 s, 4 s… hasta 30 s.
- Cuando un mensaje llega por dos caminos (socket y recarga después de un corte), se juntan sus lectores (uno por
  lector, el más temprano), en lugar de quedarse con la copia que tiene más.
- **Pantalla:** debajo de cada mensaje propio, "Leído por María Rearte a las 14:31" (con la fecha si no fue hoy, y
  todos los lectores si leyó más de uno) o "Enviado. Todavía no lo leyó nadie". Siempre en texto, con un ícono
  de apoyo. Se actualiza en tiempo real y la campana de notificaciones se refresca al retirar el aviso.

### Sonido de mensaje nuevo

- Un mensaje de otro participante suena en cualquier pestaña de la ficha (la barra de pestañas mantiene la sala
  abierta), aunque la pestaña del navegador esté en segundo plano. Con el chat abierto y a la vista suena más
  suave. Los propios no suenan; varios seguidos suenan una vez (cada 1,5 s como mucho).
- El sonido se genera con Web Audio (dos notas cortas): no hay archivo ni sonido de terceros. Los navegadores
  no dejan sonar nada hasta el primer clic o tecla en la página; antes de eso no suena.
- "Sonido de mensajes: activado / desactivado", junto al estado de la conexión del chat, lo silencia. Se recuerda
  en ese navegador (`localStorage`, clave `cova:sonido-chat`). Al activarlo suena una vez de muestra.
- `frontend/src/lib/sonido-mensajes.ts` y `hooks/use-sonido-chat.ts`.

### Mensajes sin leer en la barra de pestañas

- La pestaña del chat muestra cuántos mensajes de otros no leyó el usuario. Con 1 o más, el número se destaca (como
  el de la campana); el lector de pantalla dice "Chat (2 sin leer)".
- `GET /api/siniestros/:id/chat/sin-leer` responde `{ sinLeer }`; la ficha trae el mismo número en
  `cantidades.chatSinLeer`, para mostrarlo sin esperar la conexión.
- La barra se une a la sala del siniestro mientras la ficha está abierta. Cuando llega un mensaje de otro, cuando el
  usuario lee (en esta u otra pestaña del navegador) o al reconectar, vuelve a pedir el número al servidor. Con el
  chat abierto no suma en el momento: el mensaje se marca leído enseguida y el número no salta.
- **Estar en la sala no es mirar la conversación.** Al unirse, el servidor asume que no la está mirando; el chat
  avisa con `sala:atencion` cuando está a la vista. Así, quien está en otra pestaña de la ficha recibe el aviso en
  la bandeja aunque su navegador esté en la sala.

### Pruebas

- `npm run test:chat:leidos:db -w backend`: base temporal y Socket.IO real. Cubre:
  - la marca con usuario y hora del servidor;
  - el aviso retirado solo para quien lee;
  - la lectura informada en vivo a los demás, sin repetirse al volver a entrar;
  - varias lecturas en orden;
  - que el autor no se cuenta;
  - que el mensaje de quien mira no genera aviso, pero queda sin leer hasta marcarlo;
  - que un aviso retirado no impide el próximo;
  - dos pestañas marcando a la vez, cada una con su hora: la respuesta coincide con lo guardado;
  - un mensaje que llega mientras se marca la lectura: queda sin leer y conserva su aviso;
  - permisos (403) y caso cerrado (se lee);
  - la cantidad sin leer de cada uno (endpoint y ficha), y que unirse a la sala no cuenta como mirar.
- `chat.test.mjs` (frontend): lecturas sin repetir y sin el autor, y que se juntan los lectores de dos copias del
  mismo mensaje (socket y recarga).
- `chat-sin-conexion.test.mjs` (frontend): el lugar de los mensajes sin confirmar, qué fallas se reenvían solas y
  que una ráfaga de mensajes suene una sola vez.
- `marcado-leido.test.mjs` (frontend, relojes simulados): marcar al entrar, otra pasada si llega algo durante el
  pedido, reintentos con espera creciente, nada con la pestaña oculta, sin bucle si el servidor no marcó nada.
- `chat-tiempo-real.db.test.mjs`: si no se puede comprobar el acceso de una conexión, no recibe el envío.
