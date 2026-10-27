# Almacenamiento privado en Cloudflare R2

## Configuración

Crear el bucket privado y credenciales S3 con permiso Object Read & Write limitado
a ese bucket. Mantener deshabilitados Public Development URL y Custom Domains.
Guardar únicamente en `backend/.env`:

```dotenv
R2_ACCOUNT_ID=identificador-de-la-cuenta
R2_ACCESS_KEY_ID=access-key-id
R2_SECRET_ACCESS_KEY=secret-access-key
R2_BUCKET=siniestro-cova-dev
R2_ENDPOINT=https://identificador-de-la-cuenta.r2.cloudflarestorage.com
R2_SIGNED_URL_TTL_SECONDS=60
UPLOAD_MAX_MB=10
UPLOAD_ALLOWED_EXT=pdf,jpg,jpeg,png,docx,xlsx
```

R2_ENDPOINT es opcional para la jurisdicción estándar: se deriva de la cuenta.
Para jurisdicciones EU o FedRAMP copiar el endpoint S3 proporcionado por Cloudflare.
La validación rechaza endpoints de otra cuenta o dominio. El Token Value de la
API de Cloudflare no se utiliza como Secret Access Key del SDK S3.

Las variables se validan al usar R2, sin imprimir secretos. Las URLs duran 60
segundos por defecto (configurable de 1 a 300). No poner credenciales en frontend,
variables VITE_*, shared, código, logs ni Git. `.env` está ignorado por Git y Docker.
Compose ya inyecta `backend/.env` al servidor. No requiere cambiar el bucket a público.

## Uso desde el backend

`src/lib/r2.ts` crea un cliente S3 con región `auto`, sube bytes mediante
PutObjectCommand y firma GetObjectCommand. `crearAlmacenamientoR2()` devuelve
`subir`, `comprobarExistencia`, `firmarDescarga`, `eliminar` y `cerrar`.

`src/modules/documentos/documentos.service.ts` integra el almacenamiento con
Prisma para documentos de siniestros. Las plantillas tienen un único camino de alta
y descarga en `src/modules/plantillas/plantillas.service.ts` (ver `docs/CARGA_PLANTILLAS.md`
en la raíz). Ejemplo de integración futura para siniestros:

```ts
const documentos = crearServicioDocumentos({
  prisma: getPrisma(),
  almacenamiento: crearAlmacenamientoR2(),
  autorizar: verificarPermisosDocumentos, // Debe rechazar si el usuario no tiene permiso.
})

const documento = await documentos.subir({
  idUsuario: sesion.usuario.id,
  destino: { tipo: 'siniestro', idSiniestro },
  archivo: { nombreOriginal: archivoRecibido.nombre, contenido: archivoRecibido.buffer },
})

const descarga = await documentos.descargar({
  idUsuario: sesion.usuario.id,
  tipo: 'siniestro',
  idDocumento: documento.id,
})
// Devolver descarga con Cache-Control: no-store. No guardarla ni registrarla en logs.
```

El ejemplo necesita la sesión, política de permisos y recepción multipart del
futuro controlador de documentos de siniestros. Las plantillas sí tienen rutas HTTP
y formulario de carga, con validación del contenido real antes de subir a R2.
El callback de autorización es obligatorio. Se comprueba usuario activo, documento
activo y siniestro activo; la política decide qué usuarios pueden operar sobre cada
recurso. Nunca aceptar idUsuario o una clave de almacenamiento directamente del
navegador como prueba de autorización.

El servicio de documentos genera `siniestros/ID/UUID.ext`; el módulo de plantillas
genera `plantillas/UUID.ext`. El nombre original se conserva como metadato.

Los documentos del alta de un siniestro (CU-09, E4-10) se suben a `altas/IDUSUARIO/UUID.ext`
mientras el siniestro no existe. Al crearlo se registran con esa clave y después se mueven
a `siniestros/ID/UUID.ext`: se copian, se actualiza la clave en la base y recién entonces se
borra el original. Si la copia o la actualización fallan, el documento conserva la clave de
`altas/`, que sigue siendo válida. `altas/` es temporal: una regla de ciclo de vida de R2
borra lo que tenga más de 30 días (ver la sección de R2 en `DEPLOY.md`). El archivo de un
siniestro se identifica siempre por `DocumentoSiniestro` (idSiniestro y clave), nunca por
la carpeta.

Los campos existentes se mantienen:

| Modelo | Campo que contiene exclusivamente la clave |
| --- | --- |
| DocumentoSiniestro | urlArchivoSinDominio |
| DocumentoPlantilla | urlArchivo |

Zod rechaza URLs completas, parámetros, rutas absolutas y segmentos `..` en ambos
campos. La URL se genera al pedir la descarga, usando la clave leída de Prisma.
El tamaño de documentos se calcula con los bytes recibidos y se guarda como BigInt;
la respuesta del servicio lo convierte en texto para JSON.

Se rechazan archivos vacíos, tamaños mayores al límite y extensiones no admitidas.
El adaptador genérico de R2 deriva el MIME de la extensión y no busca malware.
El módulo de plantillas agrega la inspección del contenido real con `file-type`,
además del límite multipart de 10 MiB. La futura recepción de documentos de siniestros
deberá limitar el tamaño y completar los controles de contenido de su propia historia.
Las descargas se sirven como adjunto y con `private, no-store`.

Si falla el alta en Prisma después de subir, se intenta eliminar sólo ese nuevo
objeto. Si falla la limpieza se registra su clave para revisión. R2 y PostgreSQL
no comparten una transacción: una interrupción del proceso, un resultado incierto
de red o un rollback externo requieren reconciliación de objetos huérfanos. Una
baja lógica no borra físicamente el objeto. Un enlace ya emitido puede utilizarse
hasta su vencimiento aunque luego cambien los permisos.

## Base de datos

La migración `20261014033211_init` crea las 20 tablas del esquema ya existente,
sus enums, relaciones, índices y los 20 CHECK de baja lógica. No agrega tablas
propias de R2 ni cambia los nombres de columnas. Ejecutarla sólo contra la base
de desarrollo correcta; nunca resetear una base con datos.

Para ejecutar comandos desde Windows, DATABASE_URL debe usar `localhost:5432`.
Dentro de Compose el hostname es `db`; Compose ya sobrescribe esa variable.

```powershell
npm run prisma:migrate:deploy -w backend
npm run prisma:generate -w backend
```

## Verificación

Desde la raíz del repositorio:

```powershell
npm run test:r2 -w backend
npm run typecheck -w backend
npm run r2:smoke -w backend
```

La prueba `r2:smoke` requiere `.env`, PostgreSQL con las tablas creadas y acceso
a R2. Sube dos archivos sintéticos pequeños, guarda y vuelve a leer las claves de
ambos tipos de documento, descarga y compara bytes, comprueba el rechazo sin firma
(R2 puede responder 400 InvalidArgument, 401 o 403) y un 403 después del vencimiento
configurado. No muestra las URLs.

Los registros de prueba se crean dentro de una transacción que se revierte. Los
contadores autoincrementales pueden avanzar aunque no queden filas. Los objetos
de prueba se eliminan en `finally`; si se mata el proceso, revisar esas claves.
Se rechaza NODE_ENV=production. La prueba realiza unas pocas operaciones de R2.

Para comprobar sólo R2 sin tocar PostgreSQL:

```powershell
npm run r2:smoke -w backend -- --solo-r2
```

El rechazo del endpoint S3 verifica la exigencia de firma en ese endpoint. Confirmar
además en el panel que no haya r2.dev ni dominios públicos habilitados. Firmar una
URL localmente, por sí solo, no demuestra que las credenciales funcionen.

Referencias oficiales: [SDK S3 de JavaScript](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/)
y [URLs firmadas](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).
