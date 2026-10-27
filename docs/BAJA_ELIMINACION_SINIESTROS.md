# Baja lógica y eliminación de siniestros

## Permisos y confirmación

Solo administradores y superadministradores pueden ejecutar estas operaciones. El servidor vuelve a consultar al usuario activo y su rol; no confía en los botones visibles ni en datos de autor enviados por el cliente.

La baja lógica usa un modal de confirmación simple. Solo la eliminación definitiva pide escribir el número actual del siniestro; una confirmación incorrecta se rechaza también en el servidor.

- `PATCH /api/siniestros/:id/baja`
- `PATCH /api/siniestros/:id/reactivacion`
- `DELETE /api/siniestros/:id`

La baja y la reactivación no necesitan cuerpo (también admite `{}`) y rechaza campos adicionales. El DELETE exige `{ "numeroSiniestro": "2026-04872" }`. El usuario y la fecha siempre salen del servidor.

## Baja lógica

En una transacción se marca `eliminado`, se guarda `fechaBaja` y se registra un evento `BAJA_SINIESTRO` con el usuario y la fecha exacta. Los documentos y demás registros se conservan. Repetir la solicitud no duplica el evento.

El caso sale del listado por defecto. Administradores y superadministradores pueden encontrarlo mediante **Mostrar dados de baja**, reflejado en la URL como `bajas=true`. Los gestores no pueden consultar los casos dados de baja.

## Reactivación

Con **Mostrar dados de baja**, el menú ofrece **Reactivar** y pide confirmación. El servidor exige sesión administrativa, bloquea la fila y actualiza `eliminado=false`, `fechaBaja=null` y la fecha de último movimiento. Conserva el estado de gestión, los datos y los archivos. Registra usuario y fecha en un evento `REACTIVACION_SINIESTRO`; repetir la petición no duplica eventos.

No se reactiva un siniestro con eliminación definitiva pendiente, porque R2 podría haber borrado parte de sus archivos. Si el caso está abierto, tampoco se lo reactiva con un usuario o ajustador asignado dado de baja: primero hay que reactivar esa asociación. Esto conserva las reglas que impiden dar de baja responsables con casos activos.

## Eliminación permanente

Además de exigir **baja lógica previa** (`eliminado=true`), la regla usa `EstadoSiniestro.esCierre=true`: actualmente corresponde a **Cierre enviado**. Renombrar su texto visible no cambia el permiso; si aparecen cierres con otra regla, se deberá agregar una bandera específica al catálogo. El modal advierte que el borrado es definitivo y alcanza a los datos asociados.

1. Se bloquea la fila del siniestro, se verifican permisos, número, baja previa y estado, y se persiste `eliminacionEnCurso=true`.
2. Fuera de la transacción se eliminan en R2 todas las claves registradas en `DocumentoSiniestro`, incluidos los documentos dados de baja. Las claves deben pertenecer a `siniestros/<id>/` y no estar registradas en otro caso.
3. En una segunda transacción se bloquea de nuevo la fila, se verifican permisos, número, baja previa, cierre e inventario y se borran lecturas de chat, mensajes, notificaciones, historial, novedades, documentos, personas y peritos, y finalmente el siniestro. También se borran vehículos y direcciones que ya no estén referenciados por otros registros.

Las transacciones usan el bloqueo `FOR UPDATE` de la fila del siniestro; no usan el nivel `Serializable` ni reintentos automáticos de P2034. No hay llamadas de R2 dentro de ellas.

Se hace una sola pasada por los archivos. La comprobación final del inventario se conserva porque las verificaciones de acceso y el alta del documento no son una operación atómica: una carga iniciada antes de marcar el caso podría terminar en esa ventana. Si aparece una clave nueva, se responde 409 y se conservan los registros para un reintento explícito. El bloqueo del padre protege la comprobación final y el borrado frente a inserciones que necesitan verificar su FK. Así se elimina el ciclo de tres pasadas sin borrar metadatos de archivos que no se retiraron de R2.

Se conservan los catálogos maestros y cualquier vehículo o dirección compartidos con registros ajenos. No se recorren ni se borran objetos de R2 sin una clave registrada en el expediente.

PostgreSQL y R2 no comparten una transacción. Si falla R2, pueden haberse eliminado algunos archivos, pero se mantienen los registros y la marca persistente de eliminación pendiente. El listado ofrece **Reintentar eliminación**; el caso queda bloqueado para consultas y nuevas cargas mientras se completa. Borrar de nuevo una clave ausente es seguro. Si la base rechaza el borrado final, la operación también se puede reintentar. La carga de documentos vuelve a verificar el acceso después de subir el archivo y compensa la subida si el caso comenzó a eliminarse.

Una FK inesperada (P2003) se propaga al manejador de errores: se registra el detalle técnico en el servidor y se responde 500. No se disfraza como un conflicto 409. Si se agrega una tabla con `idSiniestro`, debe incorporarse a `borrarRegistros` y a la prueba del expediente completo.

## Migración

La migración `20261025120000_bajas_siniestros` agrega el evento de baja y la marca persistente. La migración `20261027120000_reactivacion_siniestro` agrega el valor `REACTIVACION_SINIESTRO` al enum del historial. No se eliminan datos ni se modifica Docker.

Desde la raíz del proyecto:

```sh
npm run prisma:migrate:deploy -w backend
npm run prisma:generate -w backend
```

## Verificación

```sh
npm run test:siniestros:bajas -w backend
npm run test:siniestros:bajas:db -w backend
npm run test:siniestros -w backend
npm run test:siniestros:db -w backend
npm run test:r2 -w backend
npm run typecheck
npm run lint
npm run build
```

La prueba de base de datos usa una transacción que se revierte al terminar y simula R2. Comprueba permisos, historial, filtros, bloqueo por estado, fallo parcial y reintento, relaciones completas y conservación de datos compartidos.

Para probar manualmente, usar un siniestro descartable: abrir su menú de acciones, elegir **Dar de baja** y confirmar sin escribir el número. Debe desaparecer y volver a aparecer al activar el filtro de bajas. Para la eliminación definitiva, usar un caso descartable **dado de baja** y en **Cierre enviado**, comprobar la advertencia y el número obligatorio; después de confirmar, verificar su ausencia en la base y la de sus archivos registrados en R2. No usar un expediente real para esta prueba.
