# Subir documentos al expediente (E6, CU-10 1.g.1 y CU-09 33-34)

En la ficha, Documentos permite elegir o arrastrar varios archivos y los envía de a uno, cada uno en una
petición multipart. Cada fila conserva su nombre y tamaño, muestra compresión, progreso real de envío,
guardado y resultado. El 100% solo aparece después de que el servidor confirma R2 y la base.
Si uno falla, las demás cargas continúan; Reintentar vuelve a enviar solo ese archivo con el mismo identificador.
Ocultar una fila completa no elimina el documento del expediente. La cola vive en esta pestaña del navegador;
los documentos ya confirmados quedan en el servidor y se vuelven a consultar al entrar.

## Compresión y límites

El navegador usa CompressionStream('gzip') sin pérdida antes de enviar. Si el resultado agranda un archivo
que ya estaba comprimido, envía el original. No se recomprimen imágenes con pérdida ni se alteran firmas o
documentos. El backend descomprime con maxOutputLength y guarda los bytes originales en R2: esta compresión
reduce el tráfico cuando es posible, no el tamaño permanente del documento. No requiere dependencias nuevas.

El original y el transporte tienen un máximo de 10 * 1024 * 1024 bytes. Un gzip pequeño que supera ese máximo
al descomprimirse se rechaza. Formatos: PDF, JPG/JPEG, PNG, DOCX y XLSX, comprobados por su contenido real.
El navegador informa errores inmediatos de selección; el servidor vuelve a validar todo.

## API y permisos

POST /api/siniestros/:id/documentos recibe un único campo archivo, X-Id-Carga (UUID) y
X-Archivo-Compresion (gzip o identity). No acepta autor, fecha, tamaño ni claves del almacenamiento en el formulario.
Los gestores solo cargan en casos propios y abiertos; administración puede cargar en cualquier caso abierto.
Se rechazan casos dados de baja, cerrados o con eliminación pendiente. El rol se consulta en la base.
Se verifica el acceso antes de recibir el archivo y se vuelve a comprobar, con el siniestro bloqueado,
después de subir a R2 para resolver cierres o reasignaciones simultáneos.

Autor, fecha del servidor, nombre original, tipo, tamaño original y clave privada de R2 se registran junto
con el evento DOCUMENTO del historial y la actualización de fechaUltimoMovimiento/demorado, en una transacción.
La clave tiene formato siniestros/id/uuid.ext: nunca se guarda una URL firmada.
Si no se puede registrar o se pierde el permiso, se elimina el objeto recién subido como compensación.

El UUID de carga es único. Un reintento por respuesta perdida devuelve el documento existente sin duplicar
archivo, historial ni movimiento. El identificador se verifica contra usuario, siniestro, nombre y SHA-256
de los bytes originales; reutilizarlo para otra carga se rechaza. Las cargas simultáneas del mismo UUID
se serializan y se limpia el objeto sobrante de R2.

## Migración y ejecución

20261106120000_carga_documentos_idempotente agrega idCarga UUID opcional y hashContenido opcional a
DocumentoSiniestro, conservando los documentos anteriores. No modifica Docker ni credenciales.

```sh
npm run prisma:migrate:deploy -w backend
npm run prisma:generate -w backend
```

Docker Compose ya aplica las migraciones antes de iniciar el backend. Para reconstruir ambos servicios:

```sh
docker compose up -d --build
```

## Verificación

```sh
node --experimental-strip-types --test backend/tests/documentos-carga.test.mjs
npm run test:design -w frontend
```

Desde backend, con PostgreSQL local funcionando:

```sh
node --experimental-strip-types --env-file-if-exists=.env --test tests/documentos-carga.db.test.mjs
```

La prueba crea y elimina una base aislada, simula R2 y comprueba HTTP, metadatos, formatos/tamaño, compresión,
permisos, concurrencia, reintentos, compensación y la ruta de carga del alta existente.
Prueba manual: adjuntar dos archivos, revisar que cada uno tenga su progreso y que se agreguen al listado
con autor y fecha. Ante una falla de conexión/R2, reintentar la fila fallida y comprobar que los ya guardados
no se dupliquen. Revisar también el historial y los días sin movimiento después de la carga.
