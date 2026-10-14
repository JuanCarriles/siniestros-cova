# Base de datos del backend

## Alcance

Esquema PostgreSQL de las 19 entidades del documento de implementación más
LecturaMensajeChat, agregada para registrar lecturas por usuario (20 entidades):
Pais, Provincia, Direccion, Usuario, DocumentoPlantilla, Notificacion,
HistorialSiniestro, MensajeChat, DocumentoSiniestro, NovedadSiniestro, Perito,
Aseguradora, Ajustador, Abogado, Vehiculo, TipoDocumento, PersonaInvolucrada,
EstadoSiniestro, Siniestro y LecturaMensajeChat.

Se conservan exactamente las siete enumeraciones solicitadas: TipoUsuario,
TipoNotificacion, TipoEventoHistorial, TipoPerito, RolAccidente, UsoVehiculo y
TipoLesion. No se agregaron entidades de sesión ni tokens.

Prisma CLI, Client y el adaptador PostgreSQL están fijados en 7.10.0. Se requiere
Node >=22.12.0 (usar una versión LTS compatible con Prisma). La configuración
`backend/prisma.config.ts` carga únicamente `backend/.env` si existe, usando
Node, sin sobrescribir variables que ya están en el entorno. No incluye credenciales.
El `.env.example` existente ya contiene DATABASE_URL y no fue modificado.

## Comandos desde la raíz del monorepo

```sh
npm ci
npm run prisma:format -w backend
npm run prisma:validate -w backend
npm run prisma:generate -w backend
npm run typecheck -w backend
npm run build -w backend
```

Format, validate y generate no necesitan una base en ejecución ni DATABASE_URL.
El cliente se genera en `backend/src/generated/prisma`, excluido de Git. Se
regenera antes de dev, build y typecheck. No hay generación durante `npm ci`,
porque los Dockerfiles instalan dependencias antes de copiar el esquema.

`src/lib/prisma.ts` expone `getPrisma()` y `disconnectPrisma()`. Reutiliza una
instancia del cliente y exige DATABASE_URL al acceder a ella. No conecta la API
ni implementa servicios automáticamente; los módulos todavía están vacíos.
Los procesos que lo utilicen deberán llamar a disconnectPrisma durante su cierre
ordenado. El cliente no aplica filtros automáticos ni constituye una autorización.

## Migraciones

La migración inicial es `migrations/20261014033211_init`: crea las 20 tablas, los 7 enums,
índices y FK, y al final incluye a mano los 20 CHECK de `soft-delete-checks.sql` (Prisma Schema
no representa CHECK). Las migraciones se versionan en Git y **nunca se editan una vez aplicadas**
(Prisma guarda un checksum en la tabla `_prisma_migrations`).

- **Desarrollo** (desde Windows, contra `localhost:5432` según `backend/.env`):
  - cambiar `schema.prisma` y crear la migración: `npm run prisma:migrate:dev -w backend -- --name <cambio>`.
    Si el cambio necesita SQL que Prisma no genera (CHECK, etc.), usar `--create-only`, editar el
    `migration.sql` y volver a correr el comando para aplicarla.
  - ver el estado: `npx prisma migrate status --config prisma.config.ts` (desde `backend/`).
- **Producción:** solo `prisma:migrate:deploy`, que aplica las pendientes y nunca crea ni borra.
  La imagen final del backend no incluye el CLI de Prisma: correrlo desde una etapa o entorno que
  lo tenga. No usar `db push` en ningún entorno: omitiría los CHECK y el historial.
- `soft-delete-checks.sql` queda como referencia: si se agrega una tabla nueva con baja lógica,
  su CHECK va en la migración de esa tabla.

## Seeds

Requieren las tablas creadas (migración aplicada). Están en `prisma/seeds/`.

| Seed       | Contenido                                                                                                            | Dónde                   | Comando                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------- |
| Base       | País Argentina y sus 24 jurisdicciones, 7 estados de siniestro, 4 tipos de documento                                 | Desarrollo y producción | `npm run seed:base -w backend` / en el contenedor: `node dist/seed-base.mjs` |
| Desarrollo | Base + 3 usuarios de prueba (uno por tipo), aseguradoras, ajustadores, abogados, plantillas y 6 siniestros completos | Solo desarrollo         | `npm run seed:dev -w backend`                                                |

- **Base:** idempotente gracias a los `UNIQUE` por nombre de los catálogos: inserta con
  `skipDuplicates` (`ON CONFLICT DO NOTHING`), así que crea solo lo que falta y no modifica ni
  reactiva lo existente (los dados de baja también cuentan). Se puede correr en cada deploy. Los datos
  están en `catalogos.ts`; solo "Cierre enviado" tiene `esCierre = true`.
- **Desarrollo:** se niega a correr con `NODE_ENV=production`. Si los usuarios de prueba ya existen no
  agrega nada; para recargar desde cero: `npm run db:reset:dev -w backend` (borra la base, aplica las
  migraciones y corre la seed; pide confirmación). Usuarios y contraseñas: `USUARIOS_DEV` en
  `desarrollo.ts`, mails con dominio `.test`. Las fechas son relativas al momento de correrla, así el
  caso demorado (sin movimiento hace 5 días) cumple RF-19. Los documentos apuntan a rutas de R2 que no
  existen: descargarlos falla.
- Las contraseñas se guardan con Argon2id mediante `src/lib/password.ts` (el mismo que usará el login).

## Integridad y fechas

- Todas las PK son Int autoincrementales. Las FK son Int/Int? y tienen relación
  inversa. Todas usan onDelete: Restrict y onUpdate: Restrict: borrar físicamente
  un padre referenciado o cambiar su identidad no propaga cambios a sus hijos.
- Únicos adicionales a las PK: Usuario.email, Perito.idDireccion,
  PersonaInvolucrada.idDireccion, la combinación
  LecturaMensajeChat(idMensajeChat, idUsuario) y los nombres de los catálogos: Pais.nombre,
  Provincia(idPais, nombre), EstadoSiniestro.nombre y TipoDocumento.nombre (incluyen los dados de
  baja). No hay unicidad en los números de siniestro, dominios, documentos de personas ni FK de
  relaciones 1:N.
- La unicidad del email abarca también usuarios eliminados. Una dirección
  opcional admite NULL; cada FK 1:1 impide reutilizar una dirección entre dos
  registros de su misma entidad, incluso si uno está eliminado. No se introduce
  una exclusividad global entre Perito y PersonaInvolucrada.
- Se indexan FK para joins. Notificaciones, historial, chat y documentos usan
  índices compuestos por padre, baja y campos de consulta cronológica/lectura;
  los listados de siniestros por usuario, aseguradora y estado incluyen la baja.
  No se duplican los índices únicos ni se indexa eliminado de forma aislada.
- Nacimiento, vencimiento de carnet y ocurrencia: `@db.Date`. Hora de ocurrencia:
  `@db.Time`. Los instantes de acciones y bajas: `@db.Timestamptz(3)`; pasar Date
  e ISO 8601 en UTC desde la aplicación y convertir sólo para presentación.
  PostgreSQL conserva el instante, no la zona original. Para Date/Time evitar
  conversiones de zona que cambien el día o la hora independientes.
- `inicioVigencia` sigue siendo String? por especificación. Las fechas de
  asignación, solicitud, cierre, lectura, último movimiento y baja no reciben
  valores automáticos. Carga, creación de notificación, evento y envío tienen now().
- `anio` es SmallInt y `tamanoBytes` BigInt. Al serializar documentos como JSON,
  convertir BigInt a texto para no perder precisión ni provocar errores.

## Contrato de acceso a datos para los futuros módulos

Los campos por sí solos no implementan una baja lógica. No usar delete/deleteMany
para bajas habituales. El siguiente patrón es explícito y compatible con Prisma 7:

```ts
import { getPrisma } from '../lib/prisma.ts' // ajustar según el módulo

const prisma = getPrisma()

// La capa de autenticación/autorización debe validar los permisos antes.
const activos = await prisma.usuario.findMany({ where: { eliminado: false } })
const usuario = await prisma.usuario.findUnique({
  where: { id: idUsuario, eliminado: false },
})

// Un solo UPDATE: ambos campos cambian atómicamente; conserva PK y FK.
// Antes: validar también las reglas del negocio para esa entidad.
await prisma.usuario.update({
  where: { id: idUsuario, eliminado: false },
  data: { eliminado: true, fechaBaja: new Date() },
})

// Operación administrativa autorizada y con validación de relaciones.
await prisma.usuario.update({
  where: { id: idUsuario, eliminado: true },
  data: { eliminado: false, fechaBaja: null },
})
```

La unicidad y las FK de PostgreSQL siguen vigentes en ambos estados. Los CHECK
preparados en SQL rechazan combinaciones desincronizadas, una vez incorporados y
aplicados en la migración. No dar de baja/restaurar relacionados automáticamente;
no borrar archivos de R2 al marcar un DocumentoSiniestro como eliminado.

Aplicar `eliminado: false` también en búsquedas, count, paginación, validaciones
de existencia y where de update/updateMany. Un findUnique por email sólo se usa
para autenticación si incluye el filtro activo; verificar luego el hash seguro,
nunca guardar contraseñas en texto plano ni devolver su hash en respuestas.
Sólo los procesos administrativos/auditoría autorizados pueden omitir el filtro.

Para relaciones no basta filtrar el registro principal:

```ts
const siniestro = await prisma.siniestro.findFirst({
  where: { id: idSiniestro, eliminado: false }, // añadir alcance del usuario
  include: {
    documentos: { where: { eliminado: false } },
    personasInvolucradas: { where: { eliminado: false } },
  },
})
```

Aplicar filtros equivalentes a cada nivel incluido. En relaciones to-one,
validar el estado de la entidad relacionada o consultarla por separado antes de
exponerla/usar sus datos: un padre activo puede conservar un relacionado eliminado.
No ocultar ni restaurar el expediente entero automáticamente por esa situación.

Antes de crear/conectar/reasignar registros activos, validar que los destinos
existen y están activos cuando lo exija el negocio. Hacerlo en la misma transacción
que la escritura; considerar aislamiento Serializable con reintentos acotados
de conflictos P2034 para operaciones concurrentes de asignación y baja. La FK
sólo prueba existencia: no prueba actividad ni permisos. Responder de manera
controlada a P2002 (unicidad), P2003 (FK) y P2025 (registro no encontrado/activo).

## Lecturas de chat por usuario

MensajeChat conserva `idUsuario` como autor y ya no tiene `leido` ni `fechaLeido`.
La relación `lecturas` conecta cada mensaje con sus LecturaMensajeChat; la relación
`Usuario.lecturasMensajes` identifica las lecturas realizadas por ese usuario.
El `idUsuario` de LecturaMensajeChat corresponde al lector, no al autor.

Una lectura activa representa que ese usuario leyó el mensaje. Sin lectura activa,
el mensaje está pendiente para ese usuario. `fechaLeido` es obligatoria y registra
la primera lectura en UTC, suministrada por la operación que confirma la lectura.
La combinación mensaje/usuario es única incluso entre registros dados de baja;
los accesos repetidos no deben crear duplicados ni sobrescribir la fecha original.
Si una lectura fue dada de baja, sólo restaurarla mediante una operación autorizada
que conserve su fecha original, sin crear otra fila para la misma combinación.

Para los futuros servicios de chat:

- Derivar el lector de la sesión y verificar acceso al siniestro antes de consultar
  o registrar lecturas. Una FK válida no autoriza el acceso al mensaje.
- Registrar sólo mensajes efectivamente visualizados, activos y del chat autorizado.
  Crear idempotentemente la lectura por la clave compuesta, conservando la primera
  fecha y resolviendo conflictos de unicidad ante solicitudes simultáneas.
- Para pendientes, filtrar mensajes activos del siniestro autorizado y excluir los
  enviados por el propio usuario; agregar
  `lecturas: { none: { idUsuario: usuarioSesion.id, eliminado: false } }`.
- Para mostrar quién leyó, incluir `lecturas` filtradas por `eliminado: false` y
  seleccionar sólo los datos del lector que los permisos permitan mostrar.
- El estado de Notificacion es independiente; no inferir lectura del mensaje a
  partir de una notificación leída o revisada.

El CHECK de esta nueva entidad también está preparado en soft-delete-checks.sql.
No se implementaron endpoints ni eventos Socket.IO para registrar estas lecturas.
Si una base ya tuviera los campos globales anteriores, su valor no permite saber
qué usuarios leyeron: revisar y preservar esos datos antes de migrar, sin inventar
lecturas por usuario. En este proyecto la migración inicial continúa pendiente.

## Límites funcionales conservados

- Vehiculo no tiene relación directa con Siniestro. Se vincula a través de
  PersonaInvolucrada; un vehículo sin personas no puede ubicarse en un expediente
  usando este esquema. Se requiere decisión funcional para cambiarlo.
- NovedadSiniestro guarda `autor` como texto (nombre y apellido del usuario asignado al siniestro
  al momento de cargarla, tomado de la relación Siniestro.usuario; no es una FK) y `fechaCarga`.
- TipoEventoHistorial incluye ASIGNACION, REASIGNACION y CAMBIO_ESTADO además de MENSAJE, NOVEDAD
  y DOCUMENTO. La descripción la arma `src/modules/historial/historial.textos.ts`
  (`eventoHistorial.*`): un texto que describe la situación en ese momento (p. ej. "Se asignó el
  caso al usuario Pedro González el 20/10/2026", fecha en hora argentina), sin guardar ids ni datos
  estructurados del cambio. Quién hizo la acción queda en `idUsuario` y la hora en `fechaEvento`.
- TipoNotificacion incluye ASIGNACION_SINIESTRO y REASIGNACION_SINIESTRO (RF-29).
- EstadoSiniestro.esCierre marca el estado final (solo "Cierre enviado"). Las reglas de RF-14,
  RF-18, RF-19 y RF-30 deben usar esta bandera, no el nombre del estado.
- Los flags cerrado, demorado, leida y revisada y las fechas de cierre
  siguen siendo independientes de eliminado/fechaBaja.
- El hash de contraseñas (Argon2id) está en `src/lib/password.ts`. No se implementaron aún los
  permisos, la autenticación ni los servicios de baja,
  restauración o consulta. Este documento define su contrato, no su ejecución.
