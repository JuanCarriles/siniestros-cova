# Recuperación de contraseña

Abrir `/login` y elegir «¿Olvidaste tu contraseña?». Las tres pantallas siguen el mockup de la página 11: correo, código y nueva contraseña. El marco compartido con el login está en `frontend/src/features/auth/components/auth-layout.tsx`. La contraseña nueva exige al menos 8 caracteres, una mayúscula y un número (mockup); la pantalla muestra esas reglas y marca las que se cumplen (`reglasContrasena` en `@cova/shared`).

El backend expone POST `/api/auth/recuperacion/solicitar`, `/verificar` y `/cambiar`. La solicitud siempre responde 202 con el mismo mensaje para cuentas activas, ausentes y dadas de baja. Código y autorización vencen a los 5 minutos por defecto (`RESET_TOKEN_TTL_MINUTES`), con 5 intentos por código, 60 segundos entre reenvíos y límites adicionales por IP/email. Los límites por IP/email viven en el proceso actual; para varias réplicas deben compartir almacenamiento. Los intentos del código persisten en PostgreSQL.

El desafío y la autorización viajan en cookie HttpOnly; no se guardan en URL, JSON ni almacenamiento del navegador. La base guarda hashes, incluido un HMAC del código vinculado al desafío. Cada usuario tiene una sola recuperación vigente. Al verificar se consume el código y rota la autorización. El cambio de contraseña, consumo del token y eliminación de todas las sesiones se confirman en una única transacción serializable. Después se vuelve a ingresar; no se inicia sesión automáticamente.

## Configuración y prueba

En `backend/.env`: `RESEND_API_KEY`, `RESEND_FROM` y `DATABASE_URL`. La clave permanece en el servidor. El remitente de prueba es `Estudio Cova <onboarding@resend.dev>`. Sin dominio verificado, Resend sólo entrega al correo vinculado a la cuenta. Ese correo debe pertenecer a un usuario activo de la aplicación. No se redirigen recuperaciones de otros usuarios a un buzón fijo.

Con PostgreSQL disponible: `npm run prisma:migrate:deploy -w backend`. Luego `docker compose up -d --build` para actualizar los contenedores, o usar el backend y frontend en desarrollo. En Docker el sitio usa normalmente `http://localhost:8080`.

Prueba manual: abrir dos sesiones del mismo usuario, solicitar el correo, ingresar el código y guardar una contraseña nueva. El código y el token anteriores ya no deben servir; las sesiones anteriores deben recibir 401 al consultar `/api/auth/sesion`, y el login debe aceptar la nueva contraseña. Una pestaña puede conservar su pantalla hasta su próximo pedido al servidor.

Pruebas automáticas: `npm run test:recuperacion -w backend`. Para incluir la prueba de PostgreSQL, desde `backend/`: definir `RECUPERACION_TEST_DB=1` y ejecutar `node --experimental-strip-types --env-file=.env --test tests/recuperacion.test.mjs`. La prueba crea y elimina solamente su usuario, dirección, sesiones y recuperación temporales; no envía correos reales ni cambia contraseñas existentes.

El requisito de envío desde dominio propio queda pendiente hasta verificar el dominio en Resend, configurar un remitente de ese dominio y comprobar la entrega. Los errores de envío se registran con su motivo (falta la clave, Resend rechazó con tal estado, tiempo agotado) y sin códigos, tokens, destinatarios ni credenciales; el cliente recibe la misma respuesta genérica.
