# Cambio de estado del siniestro (CU-10 1.b y 1.b.1)

El botón **Cambiar estado** está a la derecha del número y del estado actual en la cabecera de la ficha.
Administración puede cambiar el estado de cualquier caso que no esté dado de baja ni pendiente de eliminación.
Un gestor puede cambiar solo sus casos asignados y abiertos, y no puede elegir un estado con `esCierre`.
Para pedir el cierre elige **Solicitud de cierre**: el modal explica que debe confirmarlo un administrador.
Un gestor no puede cambiar un caso cerrado, ni siquiera enviando una petición directa a la API.
El servicio comprueba el usuario activo y su rol vigente en la base, además del acceso al siniestro.

## Catálogo y confirmación

`GET /api/siniestros/:id/estados` consulta `EstadoSiniestro` y devuelve los estados no dados de baja,
con nombre, descripción y bandera `esCierre`. Para el gestor excluye los estados de cierre.
No hay una lista de transiciones o nombres fija en el código; los estados se configuran en esa tabla.
Las explicaciones aparecen al pasar el mouse y quedan visibles al seleccionar, también en celular.

El diálogo permite revisar y confirmar el cambio. Un clic fuera no lo cierra. Cancelar, la cruz y Escape
permiten salir sin guardar; mientras se guarda no se puede cerrar. Al cancelar el foco vuelve al botón
**Cambiar estado**; al guardar va al mensaje de éxito, anunciado con `role="status"`, que permanece visible.

`PATCH /api/siniestros/:id/estado` recibe `{ idEstadoAnterior, idEstadoSiniestro }`.
En una transacción y con bloqueo del siniestro comprueba el acceso y el catálogo, actualiza el estado
y `fechaUltimoMovimiento`; el semáforo se calcula al consultar, agrega `CAMBIO_ESTADO` al historial con autor y fecha del servidor,
y crea las notificaciones. Conserva los eventos anteriores. Al cerrar registra `fechaCierre`; al reabrir la limpia.
Si otro usuario cambió el estado, responde 409 y permite volver a consultar. Un estado retirado o inexistente,
un cambio al mismo estado y una reapertura con responsables dados de baja se rechazan.
Si falla el historial o una notificación se revierte toda la operación.

## Integración y notificaciones

Esta rama incorpora `desarrollo`, que ya contiene la bandeja compartida, la edición y la reasignación.
Reutiliza el módulo de notificaciones y `actualizarNotificaciones()`; no crea una segunda bandeja.
La corrección previa de actividad del dashboard ya fue integrada en `desarrollo` con el PR #68.
Esta corrección de E5-04 no modifica el dashboard ni revierte su historial de casos dados de baja.

Se notifica al usuario asignado y a todos los administradores/superadministrador activos, sin duplicados
y excluyendo al autor. Cuando el gestor pide el cierre, todos los administradores activos reciben el aviso.
Los avisos son internos, sin correo. La bandeja y sus reglas de privacidad están documentadas en
`docs/NOTIFICACIONES_COMPARTIDAS.md`.

No se modifica Docker, las credenciales ni el esquema de Prisma. Estas correcciones no agregan migraciones.

## Verificación

```sh
npm run test:siniestros:estado -w backend
npm run test:siniestros:estado:db -w backend
```

La prueba de base crea `cova_test_estados_*`, aplica las migraciones y la elimina al terminar.
No modifica los datos de la base del proyecto. Comprueba roles vigentes, acceso propio/ajeno, catálogo
configurable, solicitud y confirmación de cierre, historial, movimiento, concurrencia, rollback y avisos privados.

Prueba manual: como gestor abrí un caso propio y elegí Solicitud de cierre. Revisá la explicación, confirmá
y consultá el historial. Como administrador comprobá el aviso y confirmá el estado de cierre. El gestor
puede consultar el caso cerrado, pero ya no ve el botón. Como administrador conservás la posibilidad de reabrirlo.
Abrí el modal y hacé clic fuera: debe conservar la elección. Cancelá y comprobá el foco en Cambiar estado;
volvé a abrir y confirmá: el foco debe ir al aviso de éxito.

## Restricción del cierre (E5-05)

El gestor puede cambiar los estados operativos de sus casos y llegar a **Solicitud de cierre**, pero no
confirmar un estado `esCierre` ni reabrir un caso cerrado. Solo administrador y superadministrador confirman
el cierre. El catálogo sigue siendo configurable: no se decide el permiso por el nombre o id del estado.

El servidor bloquea primero el siniestro y luego toma un bloqueo compartido del usuario antes de consultar
su rol vigente. Así una sesión vieja de un administrador degradado mientras esperaba no permite cerrar;
el rol y la baja del autor no pueden cambiar entre la autorización y el guardado.

La solicitud, historial y avisos se guardan en la misma transacción. Se notifica a todos los administradores
y superadministrador activos, excluyendo al autor y sin duplicados. No se notifica a usuarios dados de baja
ni a otros gestores. Solicitar el cierre no carga `fechaCierre`; confirmarlo como administración sí.

Las pruebas HTTP conectadas al servicio y PostgreSQL comprueban catálogo filtrado, petición directa de cierre
rechazada, rol inventado en el cuerpo, caso ajeno, historial y destinatarios de la solicitud, confirmación por
ambos roles administrativos y cambio de rol mientras la operación espera. Usan una base temporal aislada.
No se agregan migraciones ni cambios de Docker para E5-05.

## Correcciones E5-05

- Se integra origin/desarrollo, con E5-08/E5-09/E5-10. El cambio de estado solo escribe fechaUltimoMovimiento; no reintroduce la columna demorado ni su bandera almacenada.
- Se mantienen el permiso por esCierre y los bloqueos en orden Siniestro → Usuario. El rol vigente se consulta después de esperar el siniestro y queda protegido con FOR SHARE hasta el commit.
- La prueba HTTP de E5-05 tiene su propio test y su propia base temporal, separada de la prueba general de cambios de estado. Ambas usan una preparación común sin depender de las mutaciones de la otra.
- La simulación de degradación de rol comprueba que la pausa realmente ocurrió una sola vez y falla con un mensaje específico si la consulta deja de interceptarse. La espera tiene un límite de 3 segundos y la pausa se libera siempre.
- No se agrega requiereRevision ni otra migración para distinguir la solicitud de cierre: es una propuesta opcional pendiente de acuerdo. Se mantiene el aviso interno CAMBIO_ESTADO a los administradores activos.

Validación: siniestros-estado.test.mjs, siniestros-estado.db.test.mjs y siniestros-reasignacion.db.test.mjs. Las pruebas integradas crean y eliminan bases temporales; no aplican migraciones ni alteran datos de la base del proyecto. No se modifican Dockerfile ni Compose.
