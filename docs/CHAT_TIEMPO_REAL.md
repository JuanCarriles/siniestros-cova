# Chat del siniestro — conexión en tiempo real (E7-01, CU-10 1.h)

## Cómo funciona

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

## Navegador

`frontend/src/lib/tiempo-real.ts` mantiene una única conexión por pestaña. Se abre con la primera sala y se
cierra 10 s después de salir de la última. Si se corta la red o se reinicia el servidor, Socket.IO reintenta
solo con espera creciente. Al volver, se reincorpora a las salas abiertas y avisa a las pantallas
(`onReconectado`) para que pidan lo que llegó mientras tanto. El evento `offline` del navegador muestra la
pérdida al instante, sin esperar al latido de Socket.IO (unos 45 s).

La pestaña Chat muestra siempre el estado de la conexión con texto e ícono, no solo con color
(`estado-conexion-chat.tsx`). La pérdida de conexión se anuncia con `role="alert"`.

El apagado del servidor corta los transportes sin mandar un "desconectado por el servidor", porque en ese caso
el cliente no reintentaría y después de un deploy el chat quedaría muerto hasta recargar la página.

## Nginx

`frontend/nginx/snippets/app.conf` deriva `/socket.io/` al backend con `proxy_http_version 1.1`,
`Upgrade $http_upgrade`, `Connection "upgrade"` y `proxy_read_timeout 1h`. En desarrollo, el proxy de Vite hace
lo mismo (`ws: true`).

Con una sola instancia del backend no hace falta un adaptador (Redis). Si algún día hay más de una, Socket.IO
necesita el adaptador y sesiones "pegajosas" en Nginx.

## Pruebas

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

### Prueba manual

1. Entrar como gestor a la ficha de un caso propio, pestaña Chat: debe decir "Conectado".
2. Cortar el backend (o la red del equipo): aparece "Se perdió la conexión con el chat…". Al volver, sin
   recargar, vuelve a "Conectado".
3. Con Docker: lo mismo por `https://<dominio>/` (Nginx). En las herramientas del navegador, la conexión
   `/socket.io/?EIO=4&transport=websocket` debe responder `101 Switching Protocols`.
