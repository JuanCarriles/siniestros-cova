# Reasignación de siniestros

Rama: `feat/reasignar-siniestro`. Referencia: CU-10, alternativa 4.b; mockup de Datos del caso.

## Uso

1. Ingresar como administrador o superadministrador y abrir un siniestro.
2. En **Datos del caso**, pulsar **Reasignar**.
3. Elegir un usuario activo: cada tarjeta muestra nombre, rol y cantidad de casos activos. El responsable actual no se ofrece como destino. La búsqueda aparece al superar seis opciones.
4. Pulsar **Revisar reasignación**. Se muestran responsable anterior y nuevo; volver o cancelar no guarda.
5. Pulsar **Confirmar reasignación**. Se actualizan la ficha y el historial; el nuevo responsable y el anterior, si sigue activo, reciben una notificación privada y un mail mediante Resend.

El gestor anterior conserva su aviso pero el enlace lo lleva al listado, porque ya no tiene acceso a la ficha. El nuevo responsable sí puede abrir el caso. La campana del encabezado permite consultar y marcar avisos como leídos; se actualiza al abrir, al recuperar el foco y cada minuto mientras la pestaña está visible.

## Servidor

- `GET /api/siniestros/:id/reasignacion`: responsable actual y usuarios activos con carga; no devuelve emails ni contraseñas.
- `PATCH /api/siniestros/:id/reasignacion`: `{ idUsuarioAnterior, idUsuarioNuevo, confirmado: true }`.
- Se exige sesión y rol de administración, revalidado contra la base al guardar.
- Un siniestro cerrado, dado de baja o en eliminación no puede reasignarse. Se rechazan el mismo responsable, destinos inactivos y asignaciones desactualizadas con un mensaje claro.
- Bloqueo de la fila del siniestro y usuarios involucrados: dos confirmaciones simultáneas no generan dos reasignaciones a partir del mismo responsable.
- Se guardan la nueva asignación, el evento REASIGNACION con autor y fecha y las dos notificaciones en una sola transacción. Se conserva la fecha original de alta/asignación; la reasignación conserva fechaUltimoMovimiento y demorado: no reinicia el semáforo (RF-19).
- Los casos activos del selector excluyen cierres, bajas y eliminaciones pendientes.
- El mail se envía después del commit. Si falla, se informa que el cambio y los avisos internos ya quedaron guardados. El error del proveedor se registra sin credenciales. No se debe repetir la reasignación para reintentar el mail; no hay reintento automático de correo.

## Configuración y verificación

Usa `RESEND_API_KEY`, `RESEND_FROM` (o `MAIL_FROM`) y `APP_URL` ya existentes del backend. Para destinatarios reales distintos del dueño de la cuenta, Resend requiere un remitente de dominio verificado. No hay credenciales en el frontend.

La reasignación usa HistorialSiniestro, Notificacion y los tipos ya existentes. No cambia Docker ni instala dependencias. Esta operación no requiere una migración nueva. La integración incorpora las migraciones ya existentes de sus dependencias, incluida MODIFICACION_DATOS de E5-02; deben desplegarse normalmente, sin resetear datos.

Pruebas: `npm run test:siniestros:reasignacion -w backend` y `npm run test:siniestros:reasignacion:db -w backend`. La prueba de PostgreSQL crea y elimina su propia base local; no cambia datos del sistema y los mails se simulan.

## Integración de las correcciones

La rama depende de `feat/notificaciones-compartidas` y `feat/modificar-datos-rol-integrada`, preparadas sobre el desarrollo actualizado. Se integran conservando la historia publicada, sin force push. La rama original `feat/modificar-datos-rol` se conserva como referencia; usar la versión integrada para que edición no reasigne responsables.

Modificar datos y Reasignar aparecen juntos. La primera acción solo permite cambiar el ajustador dentro de asignación; el contrato estricto rechaza idUsuario y confirmarReasignacion. Solo siniestros-reasignacion.service.ts cambia el responsable de un caso existente. El evento usa la función reasignacion ya existente, con autor y fecha en la fila del historial.

Los mensajes de éxito permanecen hasta la siguiente acción. La pantalla usa actualizarNotificaciones() de la dependencia común. No se notifica por ningún medio al responsable anterior dado de baja. El correo se simula en las pruebas; no se envían mensajes reales.
