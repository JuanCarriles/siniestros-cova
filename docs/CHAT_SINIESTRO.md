# Chat del siniestro (E7-01 y E7-02, CU-10 1.h)

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

| Qué pasa | Cuándo se corta |
| --- | --- |
| Reasignación, baja o eliminación del siniestro | En el momento (la ruta llama a `revisarSala`) |
| Cambio de rol o baja del usuario, cambio de contraseña | En el momento (`revisarUsuario`) |
| Logout | En el momento, solo esa sesión (`cerrarSesion`) |
| Cualquier otro caso (sesión vencida, recuperación de contraseña) | Revisión periódica, cada 30 s |

Además, **antes de cada envío a una sala** (`emitirASala`) se revisa a cada conectado. Así el contenido del
caso nunca le llega a quien ya no tiene acceso, aunque no haya pasado la revisión periódica. El que pierde la
sala recibe `sala:expulsado`; el que pierde la sesión, `sesion:vencida`.

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
- `GET /api/siniestros/:id/chat?despues=<id>`: solo lo posterior a ese mensaje. Lo usa el navegador cada vez que
  se une a la sala (al entrar y al reconectar) para recuperar lo que llegó mientras tanto (CU-10 1.h.2).
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
   tienen la conversación a la vista**: están en la sala y con la pestaña del navegador visible
   (`sala:atencion`). Si ya tenían un aviso de mensajes nuevos sin leer en ese siniestro, se actualiza su fecha
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
- El cuadro de texto usa React Hook Form con el esquema compartido. Enter agrega una línea; se envía con el botón
  o con Ctrl+Enter.
- Al enviar, el mensaje aparece como "Enviando…" y el cuadro queda libre para el siguiente. Si falla, queda
  "No se envió", con el motivo y los botones Reintentar (usa la misma clave, así que no duplica) y Descartar.
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
