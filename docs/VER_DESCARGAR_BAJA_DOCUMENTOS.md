# Ver, descargar y dar de baja documentos (CU-10)

Rama: `feat/ver-descargar-documento-siniestro`.

## Comportamiento

- Ficha del siniestro > Documentos: grilla adaptable con miniaturas de imágenes, iconos para otros formatos, nombre original, tamaño, autor, tipo de usuario y fecha.
- Imágenes: modal con ajuste, tamaño real y zoom sobre el archivo principal guardado. Se mantiene la política elegida en E6-02: versión optimizada más miniatura; no se promete un original adicional cuando se descartó al comprimir. Las imágenes anteriores conservan sus archivos existentes.
- PDF: modal con páginas, zoom y texto extraíble. PDF.js y sus fuentes, mapas y codecs se sirven desde el mismo sistema. No se envía el expediente a Google, Microsoft ni otro visor externo. Los PDF protegidos con contraseña o dañados muestran un aviso y permiten descargar el original.
- DOCX/XLSX: solo descarga, según el alcance acordado.
- Descarga: acceso autorizado antes de emitir una URL privada de R2, por defecto 60 segundos y configurable hasta 300 segundos. Siempre `Content-Disposition: attachment` y MIME validado forzado en la firma; los derivados usan image/webp.
- Baja: confirmación y motivo obligatorio de hasta 1000 caracteres. Conserva la fila y el archivo principal y sus derivados en R2; los excluye de la grilla y bloquea nuevos accesos por API.
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

La migración existente `20261108120000_baja_documentos_siniestro` agrega los datos opcionales de baja y la relación al usuario responsable. Se conserva sin cambios. Esta corrección no agrega migraciones ni aplica cambios a la base local; las pruebas usan bases temporales.

Con Docker:

```powershell
docker compose up -d --build
```

No se modificaron Dockerfile ni Compose. El servicio de migración existente aplica la migración al desplegar. Si se usa npm, reiniciar el backend y el frontend después de instalar. No usar `db:reset:dev` ni borrar volúmenes para esta tarea.

## Prueba manual

1. Entrar a un siniestro abierto, pestaña Documentos. Subir una imagen y un PDF reales.
2. Abrir la imagen: comprobar tamaño real y zoom. Abrir el PDF: comprobar páginas, ajuste, zoom y texto de la página. En celular los controles se acomodan y el desplazamiento queda dentro del visor.
3. Descargar el archivo guardado y comprobar nombre, formato y contenido. Word y Excel se descargan directamente.
4. Elegir Dar de baja, escribir el motivo y confirmar. El documento desaparece y disminuye el contador. Revisar Historial para encontrar autor, fecha y motivo. El objeto sigue en R2.
5. Como gestor, comprobar que otro autor o una carga de más de 48 horas muestran una sola explicación de la restricción arriba de la grilla, sin repetirla por tarjeta. Intentarlo directamente por API también devuelve 403. El administrador puede dar de baja esos documentos en un caso abierto.
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

## Correcciones E6-04

- Baja con React Hook Form y zodResolver: motivo requerido de hasta 1000 caracteres, contador visible, error asociado al campo por aria-describedby/aria-invalid y foco en el campo inválido.
- El aviso de baja exitosa permanece hasta cerrarlo o realizar otra acción. Se puede cerrar desde su botón; el foco vuelve al título de la pestaña.
- La baja reutiliza prepararEdicion con bloqueo del autor, conserva el orden caso → usuario y vuelve a evaluar rol, acceso y las 48 horas. El servicio valida el cuerpo una vez; la ruta solo lo entrega.
- Los contratos DocumentoFicha siempre incluyen baja e imagen (null si no corresponde).
- El PDF privado se obtiene con un GET a R2, sin HEAD previo, y se transmite como stream con límite real de 10 MB y cancelación al cerrar la lectura. Los fallos previos a transmitir responden 404/503; los fallos a mitad del stream cortan la respuesta para que el visor permita reintentar.
- Los recursos locales de PDF.js excluyen quickjs-eval.wasm y conservan openjpeg, fuentes y mapas. No se incorpora un ejecutor de JavaScript del PDF.
- Se integra la cadena corregida de E6-01/E6-02/E6-03; no se implementan las correcciones pendientes de E5-05.

Pruebas adicionales: r2-vista.test.mjs comprueba GET único, lectura progresiva, límites, errores y liberación del stream; pdf-recursos.test.mjs verifica recursos de desarrollo y build. La prueba integrada de consulta comprueba que los accesos denegados no leen R2 y que la vista PDF no hace HEAD.
