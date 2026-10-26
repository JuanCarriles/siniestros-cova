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

## Listado y archivos ausentes

El listado consulta únicamente PostgreSQL: no inicializa el cliente de R2, no hace
pedidos por cada archivo y no crea, modifica ni elimina registros. Volver a la pestaña
no dispara una recarga automática. Después de cargar una plantilla se actualiza el listado.

Antes de emitir la URL firmada, la descarga comprueba el objeto con `HeadObject`.
Si no existe, responde 404 y muestra un aviso en la aplicación para solicitar a un
administrador que vuelva a cargar el documento. No navega a un XML de R2 y conserva
el registro. Los problemas de conexión, permisos o acceso al bucket responden 503;
no se interpretan como ausencia del archivo ni provocan borrados.

Borrar un objeto desde el panel de Cloudflare no elimina su registro en el sistema.
Las plantillas se eliminan desde la aplicación mediante **Eliminar**, con confirmación
explícita (E3-02). Un listado o una descarga nunca retiran el registro.

El listado y el selector muestran un ícono de formato: PDF, Excel, Word o imagen,
con nombre accesible para lectores de pantalla y colores de los tokens del sistema.
El botón **Elegir archivo** anuncia formatos y límite con `aria-describedby`.

## Servicio único y validación

El alta y la descarga de plantillas pasan por `plantillas.service.ts`, también desde
el script de comprobación `probar-r2.ts`. El servicio `documentos.service.ts` queda
dedicado a documentos de siniestros. El formulario público usa `altaPlantillaSchema`;
`documentoPlantillaSchema` se conserva como contrato de metadatos exportado por
`shared`, sin intervenir en la carga HTTP ni aceptar datos de autor desde el cliente.

La validación de plantillas tiene un límite fijo de 10 MiB (`PLANTILLA_MAX_BYTES`).
El adaptador R2 mantiene su propio límite global `UPLOAD_MAX_MB`: dejarlo en 10 para
admitir ese máximo. Un valor menor restringe también las cargas válidas del formulario.
Si cambia el máximo de la historia, revisar ambos límites y el cuerpo multipart de Nginx.

## Datos ficticios e historial local

La seed de desarrollo no crea plantillas ficticias. No se distribuye una migración
de producción para limpiar ejemplos de desarrollo: se retira del repositorio
`20261023140000_quitar_plantillas_ficticias`, cuyo SQL solo borraba esas filas y no
modificaba el esquema. Se conserva `20261023120000_datos_plantillas`, que sí agrega
los campos necesarios para la funcionalidad.

Si una base local ya ejecutó la migración retirada, su aplicación previa sigue en
`_prisma_migrations`. Esta corrección no altera ese historial ni restaura o elimina
filas; tampoco ejecuta un reset. Antes de usar `migrate dev` en esa base, revisar y
reconciliar el historial local con el equipo, preservando los datos. Una base nueva
o un VPS donde esa limpieza nunca se aplicó no debe ejecutarla.

Para retirar ejemplos antiguos de una base de desarrollo, identificar y revisar sus
registros específicos con el equipo. No resetear una base con datos para limpiar fixtures.

## Eliminación definitiva desde el sistema

Administradores y superadministradores pueden usar **Eliminar** en el listado. El modal
identifica la plantilla y el archivo, advierte que el borrado es definitivo y aclara
que los documentos ya generados no se modifican ni se eliminan. El foco inicial queda
en **Cancelar**. Los gestores no ven la acción y el servidor rechaza su DELETE con 403.

`DELETE /api/plantillas/:id` valida id, sesión y rol vigente. El servidor toma la clave
de la base, elimina el objeto en R2 y recién después elimina físicamente el registro.
Si R2 falla, conserva la fila para reintentar. Si la base falla después del borrado en
R2, un reintento completa la limpieza. La operación es idempotente:
un objeto o registro ya ausente no impide volver a confirmar. No se recorren ni borran
documentos de siniestros, que tienen claves y registros independientes.

Si la base falla después de borrar en R2, el modal indica: «No se pudo completar
la eliminación. Volvé a tocar “Eliminar definitivamente” para terminarla». Este aviso
se muestra también aunque el cliente HTTP oculte por seguridad el texto general de
los errores 503. El registro permanece visible hasta que se confirme un reintento;
abrir el listado o intentar descargar no lo elimina automáticamente.

`DocumentoPlantilla.eliminado` y `fechaBaja` se conservan por compatibilidad con
datos históricos y sus filtros. Esta acción hace un borrado físico y no escribe
esas columnas. Retirarlas, si el equipo lo decide, requiere otra migración.
