# Carga de plantillas de documentos

Disponible en `/plantillas`, desde el menú lateral del sistema.

Los administradores y superadministradores pueden cargar documentos. Los gestores
pueden consultar el listado y descargar, pero el servidor rechaza sus intentos de alta.

## Flujo

1. Elegir **Cargar plantilla**.
2. Completar encabezado (hasta 120 caracteres) y descripción (hasta 1000).
3. Arrastrar un único archivo o usar **Elegir archivo**, también accesible por teclado.
4. Confirmar la carga. El listado muestra el archivo, su tamaño, fecha y persona que lo subió.

Se admiten PDF, JPG/JPEG, PNG, DOCX y XLSX, hasta 10 MB (10 × 1024 × 1024 bytes).
El navegador verifica extensión y tamaño para avisar rápido. El servidor impone el
límite binario y usa `file-type` para detectar el formato desde el contenido y cotejarlo
con la extensión: cambiarle el nombre a un ejecutable o renombrar XLSX a DOCX no alcanza.
No se confía en el MIME que declara el navegador. Esta detección de formato no sustituye
una validación exhaustiva de integridad ni un análisis antivirus.

La fecha sale de PostgreSQL; el autor se obtiene de la sesión y se vuelve a comprobar
su rol vigente. No se aceptan esos campos desde el formulario. En la base se guarda
únicamente la clave privada de R2. Para descargar se genera una URL firmada corta al
solicitarla, con sesión vigente. Si falla el registro tras subir, se elimina el objeto
recién creado como compensación.

## Base y Docker

La migración `20261023120000_datos_plantillas` agrega encabezado, descripción y tamaño.
Conserva las filas existentes usando su nombre original como encabezado. El tamaño
anterior, si se desconoce, se muestra como «No registrado». No se borran ni reemplazan datos.

En desarrollo local:

```powershell
npm install
npm run prisma:migrate:deploy -w backend
npm run dev -w backend
npm run dev -w frontend
```

Con Docker:

```powershell
docker compose up -d --build
```

Compose aplica las migraciones mediante su servicio `migrate`. Nginx admite 11 MB
para el cuerpo multipart (archivo más metadatos); el backend limita el archivo a 10 MB.
Las credenciales continúan exclusivamente en el entorno del servidor (`backend/.env`).

## Verificación

```powershell
npm run test:plantillas -w backend
npm run test:plantillas:db -w backend
```

Las pruebas de base usan una transacción que se revierte; las de almacenamiento usan
un adaptador simulado y no suben a R2. Las fixtures de los cinco formatos son ficticias.

Para probar manualmente, cargar un documento, verificar autor y fecha, y descargarlo.
Intentar un archivo mayor a 10 MB y uno de texto renombrado a PDF: ambos deben rechazarse.
Un gestor debe poder descargar sin ver el botón de carga, y un POST directo suyo debe
responder 403. La edición de plantillas no forma parte de esta historia.

## Registros ficticios de la seed

La seed de desarrollo ya no crea plantillas ficticias. La migración
`20261023140000_quitar_plantillas_ficticias` retira solo las tres filas antiguas,
identificadas por su nombre, clave fija y tamaño sin registrar. Las cargas reales
con claves UUID se conservan. La sección empieza vacía hasta cargar un archivo real.

El listado y el selector muestran un ícono de formato: PDF, Excel, Word o imagen,
con nombre accesible para lectores de pantalla y colores de los tokens del sistema.

Antes de emitir la URL firmada, la descarga comprueba el objeto con `HeadObject`.
Si no existe, responde 404 y el frontend muestra un aviso en el listado; no navega
a un XML de R2. Los problemas de acceso o conexión responden 503 y no se confunden
con la ausencia del archivo. La comprobación de descarga no modifica registros; el listado realiza la conciliación que se describe debajo.

## Eliminaciones realizadas desde Cloudflare

Al consultar el listado, el servidor comprueba la existencia de las plantillas en R2
en grupos de hasta cinco pedidos simultáneos. Los registros de archivos que R2 confirma
como ausentes (404) se eliminan físicamente de `DocumentoPlantilla`. Se compara tanto
el id como la clave almacenada para no retirar una fila cuyo archivo haya cambiado.
Solo se revisan las plantillas activas; no se modifican documentos de siniestros.

Si alguna consulta falla por red, credenciales, permisos o disponibilidad del bucket,
se interrumpe la conciliación sin eliminar ningún registro. Ante un 404 del archivo,
también se verifica que el bucket siga accesible para descartar un 404 genérico del bucket. No se interpreta un error
de acceso como una eliminación. Un listado vacío no necesita conectarse con R2.

La consulta se ejecuta al entrar, recargar o volver a la ventana/pestaña de Plantillas.
No hay una notificación push de Cloudflare ni un proceso que corra en segundo plano
cuando nadie usa el sistema.

## Eliminación definitiva desde el sistema

Administradores y superadministradores pueden usar **Eliminar** en el listado. El modal
identifica la plantilla y el archivo, advierte que el borrado es definitivo y aclara
que los documentos ya generados no se modifican ni se eliminan. El foco inicial queda
en **Cancelar**. Los gestores no ven la acción y el servidor rechaza su DELETE con 403.

`DELETE /api/plantillas/:id` valida id, sesión y rol vigente. El servidor toma la clave
de la base, elimina el objeto en R2 y recién después elimina físicamente el registro.
Si R2 falla, conserva la fila para reintentar. Si la base falla después del borrado en
R2, un reintento o la conciliación completa la limpieza. La operación es idempotente:
un objeto o registro ya ausente no impide volver a confirmar. No se recorren ni borran
documentos de siniestros, que tienen claves y registros independientes.
