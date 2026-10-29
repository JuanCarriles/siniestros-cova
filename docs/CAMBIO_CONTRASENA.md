# Cambiar contraseña y cerrar sesión

En **Mi perfil → Cambiar contraseña** se abre un único modal siguiendo el mockup del CU-07: contraseña actual, nueva y repetición. Las reglas están visibles y se marcan al escribir. Tanto el formulario como `PATCH /api/perfil/contrasena` validan al menos 8 caracteres, una mayúscula y un número, hasta 128 caracteres y confirmación idéntica. La contraseña actual se comprueba en el servidor con el límite de intentos del perfil. Los campos permanecen editables y permiten gestores de contraseñas, pegado y dictado: `current-password` para la actual y `new-password` para la nueva y su repetición. El formulario se descarta al cerrarlo; el navegador puede completar credenciales guardadas.

Al confirmar **Cambiar contraseña y salir**, la contraseña, la eliminación de todas las sesiones (incluida la actual) y la invalidación de recuperaciones pendientes se guardan en una sola transacción. Se borra la cookie y se vuelve al ingreso con un mensaje. Las otras pestañas o dispositivos pierden acceso en su siguiente pedido al servidor; pueden conservar la pantalla anterior hasta entonces.

Después del commit se envía un aviso de seguridad al correo actual de esa cuenta por Resend. No contiene contraseñas, códigos ni tokens. Comparte transporte con la recuperación, cuyo mensaje se mantiene. Usa `RESEND_API_KEY` y `RESEND_FROM` (o `MAIL_FROM`) de `backend/.env`, con un remitente de dominio verificado. El remitente de prueba `onboarding@resend.dev` tiene las restricciones de prueba de Resend.

Si el proveedor falla, el cambio y el cierre de sesiones se mantienen. El ingreso muestra que el aviso no pudo enviarse y el servidor registra un motivo controlado (configuración, rechazo HTTP, red o tiempo agotado), sin datos privados. No hay reenvío automático. La respuesta `{ correoEnviado: true }` indica aceptación del envío por Resend, no confirmación de entrega al buzón.

**Salir** en el menú lateral conserva el modal de confirmación, con foco inicial en **Cancelar**. Cancelar mantiene la sesión; confirmar la revoca en el servidor.

## Verificación

- `npm run test:perfil -w backend`: contratos, reglas, borrado de cookie y envío con Resend simulado.
- `npm run test:perfil:db -w backend`: contraseña actual incorrecta, revocación de todas las sesiones y recuperaciones, aviso al correo de la cuenta y fallo del proveedor sin revertir el cambio. Todos los datos se revierten al finalizar y no se envían correos reales.
- Prueba manual: abrir dos navegadores con el mismo usuario de prueba; cancelar el cierre desde **Salir** y comprobar que se conserva el acceso. Cambiar la contraseña en **Mi perfil**. Debe volver al ingreso, rechazar la contraseña anterior y aceptar la nueva; el otro navegador debe perder acceso al hacer otro pedido. Revisar el aviso en el correo de esa cuenta y en Resend.

No requiere migraciones ni cambios del esquema de Prisma.

La configuración de correo se comparte desde `backend/src/config/correo.ts`. El perfil y el listado usan `DIAS_DEMORADO` con límite inclusivo (actualmente 72 horas o más); las pruebas comprueban el instante anterior, el exacto y el posterior.
