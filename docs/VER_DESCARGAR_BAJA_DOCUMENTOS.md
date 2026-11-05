# Ver, descargar y dar de baja documentos (CU-10)

Rama: `feat/ver-descargar-documento-siniestro`.

## Comportamiento

- Ficha del siniestro > Documentos: grilla adaptable con miniaturas de imágenes, iconos para otros formatos, nombre original, tamaño, autor, tipo de usuario y fecha.
- Imágenes originales: modal con ajuste, tamaño real y zoom; se conserva la corrección de nitidez de `feat/corregir-nitidez-imagenes`.
- PDF: modal con páginas, zoom y texto extraíble. PDF.js y sus fuentes, mapas y codecs se sirven desde el mismo sistema. No se envía el expediente a Google, Microsoft ni otro visor externo. Los PDF protegidos con contraseña o dañados muestran un aviso y permiten descargar el original.
- DOCX/XLSX: solo descarga, según el alcance acordado.
- Descarga: acceso autorizado antes de emitir una URL privada de R2, por defecto 60 segundos y configurable hasta 300 segundos. Siempre `Content-Disposition: attachment`.
- Baja: confirmación y motivo obligatorio de hasta 1000 caracteres. Conserva la fila y el original y sus derivados en R2; los excluye de la grilla y bloquea nuevos accesos por API.
- Registra `eliminado`, `fechaBaja`, `idUsuarioBaja`, `motivoBaja` y un evento DOCUMENTO en el historial con nombre original, motivo, autor y fecha. La baja y el evento se guardan juntos o se revierten juntos. No reinicia la fecha de último movimiento.
- Un gestor solo puede dar de baja un documento propio, de un siniestro que siga asignado a él, hasta exactamente 48 horas desde la carga. Después debe solicitarlo a un administrador. Administrador y superadministrador no tienen el límite de autor/plazo. Los expedientes cerrados, dados de baja o en eliminación definitiva son de solo lectura para esta operación.
- El servidor consulta el rol y estado actuales y valida después de bloquear el caso. Una pantalla abierta no conserva permisos si el caso se reasigna. Dos bajas simultáneas producen un único evento.
- Una URL de R2 ya emitida puede continuar funcionando hasta su vencimiento; una baja no revoca firmas existentes ni archivos ya descargados.

## Instalación y base

Desde la raíz del repositorio:

```powershell
npm install
npm run prisma:migrate:deploy -w backend
npm run prisma:generate -w backend
```

La migración `20261108120000_baja_documentos_siniestro` agrega dos columnas opcionales y la relación al usuario responsable. No borra ni reinicia datos y no ejecuta seeds. Ya se aplicó en la base local durante la implementación.

Con Docker:

```powershell
docker compose up -d --build
```

No se modificaron Dockerfile ni Compose. El servicio de migración existente aplica la migración al desplegar. Si se usa npm, reiniciar el backend y el frontend después de instalar. No usar `db:reset:dev` ni borrar volúmenes para esta tarea.

## Prueba manual

1. Entrar a un siniestro abierto, pestaña Documentos. Subir una imagen y un PDF reales.
2. Abrir la imagen: comprobar tamaño real y zoom. Abrir el PDF: comprobar páginas, ajuste, zoom y texto de la página. En celular los controles se acomodan y el desplazamiento queda dentro del visor.
3. Descargar el original y comprobar nombre y contenido. Word y Excel se descargan directamente.
4. Elegir Dar de baja, escribir el motivo y confirmar. El documento desaparece y disminuye el contador. Revisar Historial para encontrar autor, fecha y motivo. El objeto sigue en R2.
5. Como gestor, comprobar que otro autor o una carga de más de 48 horas muestran la explicación de la restricción. Intentarlo directamente por API también devuelve 403. El administrador puede dar de baja esos documentos en un caso abierto.
6. Si otro usuario ya lo dio de baja, se informa el conflicto y se recarga el listado.

## API

- `GET /api/siniestros/:id/documentos`: listado activo y permiso/motivo de baja calculado por el servidor; no contiene claves privadas.
- `GET /api/siniestros/:id/documentos/:idDocumento/original`: redirección a URL firmada corta; cada descarga vuelve a autorizar.
- `GET /api/siniestros/:id/documentos/:idDocumento/miniatura|vista`: derivados de imagen privados.
- `GET /api/siniestros/:id/documentos/:idDocumento/contenido`: PDF autorizado para el visor local, por SDK y mismo origen, como attachment y sin caché. Lectura limitada a 10 MB y 30 segundos.
- `PATCH /api/siniestros/:id/documentos/:idDocumento/baja`: `{ "motivo": "Documento incorrecto" }`; 204 al confirmar, 400 por motivo inválido, 403 por permisos, 404 si no pertenece al expediente y 409 si ya está dado de baja o el caso no se puede modificar.

## Verificación automatizada

Desde `backend`:

```powershell
node --experimental-strip-types --test tests/documentos-consulta.test.mjs
node --experimental-strip-types --env-file-if-exists=.env --test tests/documentos-consulta.db.test.mjs
```

La prueba integrada crea y elimina su propia base local temporal. Prueba lectura privada, baja auditada, restricciones de autor y 48 horas, roles actuales, confirmaciones concurrentes, reversión por fallo de historial y reasignación mientras una baja espera un bloqueo. No carga ni elimina archivos reales en R2.
