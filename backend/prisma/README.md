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
El `.env.example` contiene un ejemplo de DATABASE_URL para desarrollo local.

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
automáticamente. El servicio interno de documentos recibe el cliente por inyección.
Los procesos que lo utilicen deberán llamar a disconnectPrisma durante su cierre
ordenado. El cliente no aplica filtros automáticos ni constituye una autorización.

## Conexión y migración pendientes

La migración inicial está preparada en `migrations/20261014000000_init` e incluye
las 20 tablas, los enums, las relaciones, los índices y los CHECK de baja lógica.
Verificar su aplicación en cada entorno con `prisma migrate status`.

Para continuar sobre una base de desarrollo preparada y revisada:

1. Configurar DATABASE_URL en `backend/.env` sin versionar credenciales. Usar
   `localhost:5432` desde Windows; el Compose existente usa `db:5432` dentro de
   Docker. Un `.env` vacío no configura una conexión para los comandos locales.
2. Verificar que el destino sea la base de desarrollo correcta. Si contiene datos
   o tablas anteriores, revisar su estado y la necesidad de una línea base antes
   de continuar. No aceptar un reset de una base con datos.
3. Revisar la migración inicial existente. Ya incorpora `soft-delete-checks.sql`.
   Prisma Schema no representa estos CHECK; deben conservarse en el historial
   de migraciones. No sustituir este flujo por `db push`, que omitiría los CHECK.
4. Aplicar la migración revisada con
   `npm run prisma:migrate:deploy -w backend`, y volver a generar el cliente con
   `npm run prisma:generate -w backend`.
5. Para cambios posteriores crear una nueva migración con `prisma:migrate:dev`;
   no editar una migración que ya se aplicó.
6. En un despliegue posterior usar `prisma:migrate:deploy` con las migraciones
   revisadas y versionadas. La imagen de producción actual no instala el CLI de
   desarrollo; ejecutar las migraciones en una etapa o entorno que lo incluya.

La presencia del archivo SQL no demuestra que esté aplicado: comprobar siempre
el estado de las migraciones en la base destino.

## Integridad y fechas

- Todas las PK son Int autoincrementales. Las FK son Int/Int? y tienen relación
  inversa. Todas usan onDelete: Restrict y onUpdate: Restrict: borrar físicamente
  un padre referenciado o cambiar su identidad no propaga cambios a sus hijos.
- Únicos adicionales a las PK: Usuario.email, Perito.idDireccion,
  PersonaInvolucrada.idDireccion y la combinación
  LecturaMensajeChat(idMensajeChat, idUsuario). No hay unicidad en los números de siniestro,
  dominios, documentos de personas, nombres ni FK de relaciones 1:N.
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
- NovedadSiniestro no tiene autor ni fecha de creación, como exige el adjunto.
- TipoEventoHistorial contiene sólo MENSAJE, NOVEDAD y DOCUMENTO; no se agregaron
  valores para asignaciones, cambios de estado u otros eventos del PDF anterior.
- Los flags cerrado, demorado, leida y revisada y las fechas de cierre
  siguen siendo independientes de eliminado/fechaBaja.
- No se implementaron aún los permisos, hash, autenticación ni servicios de baja,
  restauración o consulta. Este documento define su contrato, no su ejecución.
