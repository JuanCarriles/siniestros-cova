# Edición de datos del caso por rol (CU-10 2.a, 4.a, 4.b y 5.a)

En la pestaña Datos del caso, Modificar datos habilita la edición en los cuatro bloques del mockup.
Administradores y superadministrador editan póliza, asignación, hecho y lugar. Un gestor solo puede editar
hecho y lugar de un caso asignado a él; los otros bloques quedan deshabilitados. El servidor vuelve a consultar
el rol y rechaza los cuerpos que intenten incluir campos protegidos. No se editan casos de baja ni con borrado pendiente.

GET /api/siniestros/:id/edicion entrega datos, catálogos vigentes y una versión de la lectura.
PATCH /api/siniestros/:id/datos valida Zod según el rol, vuelve a comprobar el acceso y bloquea el siniestro
durante la transacción. Si se modificó mientras el formulario estaba abierto, responde 409 sin sobrescribirlo.
Cancelar no guarda. Los errores conservan el formulario y señalan el campo correspondiente.

El número no se repite en una misma aseguradora, sin distinguir mayúsculas e incluyendo los casos de baja.
El propio caso se excluye de la consulta. El índice único existente también protege dos guardados simultáneos;
P2002 se traduce a un error legible del número. Ajustador debe pertenecer a la aseguradora y las nuevas
referencias deben estar activas. Se conservan referencias retiradas si no se modifican.

Una edición real agrega MODIFICACION_DATOS a HistorialSiniestro, con valores anteriores/nuevos, autor de
la sesión y fecha del servidor; actualiza fechaUltimoMovimiento. Sin cambios no crea eventos ni altera fechas.
Las direcciones compartidas se copian antes de editar para no alterar otros registros.

Reasignar el responsable pide confirmación, registra REASIGNACION y avisa al anterior y al nuevo usuario
activo por el sistema y por mail. El aviso del gestor anterior se conserva en su bandeja y lleva al listado, porque ya no puede abrir el caso.
Si falla Resend, los datos y avisos internos se conservan y se informa que no salieron todos los mails.
Los correos se mandan después de confirmar la transacción; las pruebas usan un remitente simulado.

La migración 20261102160000_historial_modificacion_datos agrega únicamente un valor al enum de historial.
No modifica columnas, Docker ni elimina datos. Aplicar con npm run prisma:migrate:deploy -w backend.

Verificación:

```sh
npm run test:siniestros:edicion -w backend
npm run test:siniestros:edicion:db -w backend
npm run lint --workspaces --if-present
npm run build
```

Las pruebas de base usan cova_test_edicion_*, aplican migraciones allí y eliminan esa base temporal al terminar.
Para probarlo a mano: abrir una ficha activa como administrador, modificar y guardar; revisar Historial.
Como gestor asignado, comprobar que solo Hecho y Lugar se habilitan. Repetir un número de la misma
aseguradora para ver el error sin perder los demás campos. Cambiar el usuario asignado para confirmar la
reasignación y consultar los avisos desde las dos cuentas.
