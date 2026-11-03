# Cambio de estado del siniestro (CU-10 1.b)

El botón **Cambiar estado** está a la derecha del número y del estado actual en la cabecera de la ficha.
Solo aparece para administrador y superadministrador y se oculta en los siniestros dados de baja.
Las rutas y el servicio verifican los permisos; no alcanza con ocultar el botón.

## Catálogo y confirmación

`GET /api/siniestros/:id/estados` consulta `EstadoSiniestro` y devuelve los estados no dados de baja,
con nombre, descripción y bandera `esCierre`. No hay una lista de transiciones ni de nombres fija en el código.
El catálogo se configura en esa tabla (por ejemplo, con Prisma Studio); esta tarea no agrega un ABM de estados.
Un estado agregado o una descripción editada se ve la próxima vez que se abre el selector.

La explicación aparece al pasar el mouse o enfocar con el teclado y queda visible en la opción seleccionada,
para poder leerla también desde el celular.
La descripción del estado actual se consulta enfocando o pasando el mouse por su chip.
El diálogo permite elegir, revisar el cambio y confirmarlo; no escribe al seleccionar una opción.

`PATCH /api/siniestros/:id/estado` recibe `{ idEstadoAnterior, idEstadoSiniestro }`.
En una transacción y con bloqueo del siniestro, vuelve a comprobar al actor y el catálogo, actualiza el estado
y `fechaUltimoMovimiento`, limpia la marca de demora, agrega un evento `CAMBIO_ESTADO` a `HistorialSiniestro`
con el autor de la sesión y la fecha del servidor, y crea las notificaciones.
Conserva todos los eventos anteriores, visibles en la ficha y en la actividad del dashboard.
Al pasar a un estado `esCierre`, registra `fechaCierre`; al salir de él la limpia.

Se rechazan los casos de baja o con eliminación pendiente, un destino retirado y una selección sin cambios.
Si otro usuario cambió el estado desde que se abrió el diálogo, responde 409 y permite volver a consultar.
No se reabre un caso con responsable o ajustador dados de baja: primero se deben regularizar esas relaciones.
Si falla el historial o un aviso, se revierte toda la operación.

## Notificaciones internas

Se crea un aviso no leído para el usuario asignado y cada administrador/superadministrador activo,
sin duplicados y excluyendo a quien hizo el cambio. Son usuarios internos; no se envían correos a las partes,
ajustadores o peritos. El caso de uso pide avisos por el sistema, no por mail.

La cabecera del Layout incluye **Notificaciones**, con cantidad sin leer, fecha, mensaje y acceso a la ficha.
La bandeja se actualiza al abrir, al navegar, al recuperar el foco y manualmente. No consulta en segundo
plano durante la inactividad, para respetar el vencimiento de la sesión.
Tiene páginas de 20 avisos y marca el aviso como leído al abrirlo.
`GET /api/notificaciones?pagina=1` y `PATCH /api/notificaciones/:id/lectura` siempre usan el usuario de la sesión.
Un gestor no puede consultar avisos de casos ajenos, reasignados o de baja; administración conserva acceso a
los casos de baja. Las eliminaciones pendientes se excluyen porque no se puede abrir su ficha.

No se modifica Docker ni el esquema de Prisma; se usan las tablas y los enums existentes.
La corrección previa de actividad reciente de los siniestros dados de baja se conserva en esta rama.

## Verificación

```sh
node --experimental-strip-types --test backend/tests/siniestros-estado.test.mjs
npm run test:siniestros:estado:db -w backend
```

La prueba de base crea `cova_test_estados_*`, aplica las migraciones y elimina esa base temporal al terminar.
Comprueba permisos, catálogo dinámico, historial inmutable, fechas, cierre/reapertura, avisos, reversión por error,
cambios concurrentes, privacidad, lectura y paginación. No cambia los datos de la base del proyecto.

Prueba manual: como administrador abrí una ficha activa y cambiá su estado. Revisá el chip, los días sin
movimiento, la pestaña Historial y la actividad del dashboard. En otra sesión del usuario asignado o de otro
administrador, abrí Notificaciones y seguí el enlace. Con un gestor el botón no aparece y la API devuelve 403.
