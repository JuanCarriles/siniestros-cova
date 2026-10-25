# Baja lógica y eliminación de siniestros

## Permisos y confirmación

Solo administradores y superadministradores pueden ejecutar estas operaciones. El servidor vuelve a consultar al usuario activo y su rol; no confía en los botones visibles ni en datos de autor enviados por el cliente.

Ambos modales piden escribir el número actual del siniestro. Una confirmación incorrecta se rechaza también en el servidor.

- `PATCH /api/siniestros/:id/baja`
- `DELETE /api/siniestros/:id`

Cuerpo de ambas solicitudes: `{ "numeroSiniestro": "2026-04872" }`. La validación es estricta y no admite campos adicionales.

## Baja lógica

En una transacción se marca `eliminado`, se guarda `fechaBaja` y se registra un evento `BAJA_SINIESTRO` con el usuario y la fecha exacta. Los documentos y demás registros se conservan. Repetir la solicitud no duplica el evento.

El caso sale del listado por defecto. Administradores y superadministradores pueden encontrarlo mediante **Mostrar dados de baja**, reflejado en la URL como `bajas=true`. Los gestores no pueden consultar los casos dados de baja.

## Eliminación permanente

Solo se admite el estado **Cierre enviado**, con `esCierre=true`. El modal advierte que el borrado es definitivo y alcanza a los datos asociados.

1. Se bloquea la fila del siniestro, se verifican permisos, número y estado, y se persiste `eliminacionEnCurso=true`.
2. Fuera de la transacción se eliminan en R2 todas las claves registradas en `DocumentoSiniestro`, incluidos los documentos dados de baja. Las claves deben pertenecer a `siniestros/<id>/` y no estar registradas en otro caso.
3. Se vuelven a verificar las condiciones y el inventario de documentos. Si apareció un documento durante la operación, se elimina su archivo antes de continuar.
4. En una transacción se borran lecturas de chat, mensajes, notificaciones, historial, novedades, documentos, personas y peritos, y finalmente el siniestro. También se borran vehículos y direcciones que ya no estén referenciados por otros registros.

Se conservan los catálogos maestros y cualquier vehículo o dirección compartidos con registros ajenos. No se recorren ni se borran objetos de R2 sin una clave registrada en el expediente.

PostgreSQL y R2 no comparten una transacción. Si falla R2, pueden haberse eliminado algunos archivos, pero se mantienen los registros y la marca persistente de eliminación pendiente. El listado ofrece **Reintentar eliminación**; el caso queda bloqueado para consultas y nuevas cargas mientras se completa. Borrar de nuevo una clave ausente es seguro. Si la base rechaza el borrado final, la operación también se puede reintentar. La carga de documentos vuelve a verificar el acceso después de subir el archivo y compensa la subida si el caso comenzó a eliminarse.

## Migración

La migración `20261025120000_bajas_siniestros` agrega el evento del historial y la marca persistente. No elimina datos existentes.

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

Para probar manualmente, usar un siniestro descartable: abrir su menú de acciones, elegir **Dar de baja**, escribir su número y confirmar. Debe desaparecer y volver a aparecer al activar el filtro de bajas. Para la eliminación definitiva, usar un caso descartable en **Cierre enviado**, comprobar la advertencia y el número obligatorio; después de confirmar, verificar su ausencia en la base y la de sus archivos registrados en R2. No usar un expediente real para esta prueba.
