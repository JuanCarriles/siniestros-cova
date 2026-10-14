# Validaciones Zod compartidas

Esquemas de datos reutilizables desde frontend y backend, basados en las 20
entidades actuales de `backend/prisma/schema.prisma`. No incluyen componentes,
formularios React, resolvers de React Hook Form, endpoints ni acceso a PostgreSQL.
Usan Zod 4.6.7 ya instalado; no importan Prisma ni código exclusivo del servidor.

## Uso

```ts
import { usuarioSchema, usuarioUpdateSchema, type UsuarioInput } from '@cova/shared'

const resultado = usuarioSchema.safeParse(datos)
if (!resultado.success) {
  // Cada issue identifica el campo con path y explica el error con message.
  const errores = resultado.error.issues
} else {
  const datosValidados = resultado.data
}

// Sólo valida los campos enviados. No permite objetos vacíos ni campos desconocidos.
const cambios = usuarioUpdateSchema.parse({ telefono: '11 1234-5678' })
```

También se pueden importar módulos específicos:
`import { siniestroSchema } from '@cova/shared/schemas/siniestros'`.

Cada entidad exporta:

- `entidadSchema`: datos para alta. Mantiene campos obligatorios y nullable de Prisma.
- `entidadUpdateSchema`: edición parcial; requiere al menos un valor definido.
- `EntidadInput` / `EntidadUpdateInput`: tipos de entrada antes de normalizar.
- `EntidadData` / `EntidadUpdateData`: tipos de salida después de validar.

El export anterior `aseguradoraSchema` y su tipo `AseguradoraInput` se mantienen.
Se conserva su máximo existente de 100 caracteres para el nombre. Todos los
objetos ahora son estrictos: un campo desconocido produce error en vez de descartarse.

## Esquemas disponibles

| Módulo | Entidades |
| --- | --- |
| paises, provincias, direcciones | Pais, Provincia, Direccion |
| usuarios | Usuario |
| plantillas, documentos | DocumentoPlantilla, DocumentoSiniestro |
| notificaciones, historial, novedades | Notificacion, HistorialSiniestro, NovedadSiniestro |
| chat | MensajeChat, LecturaMensajeChat |
| aseguradoras, ajustadores | Aseguradora, Ajustador |
| peritos, abogados | Perito, Abogado |
| vehiculos, personas | Vehiculo, PersonaInvolucrada |
| tipos-documento, estados-siniestro, siniestros | TipoDocumento, EstadoSiniestro, Siniestro |

`enums.ts` contiene las siete enumeraciones de Prisma como esquemas y tipos
TypeScript: TipoUsuario, TipoNotificacion, TipoEventoHistorial, TipoPerito,
RolAccidente, UsoVehiculo y TipoLesion. Los valores son exactos y distinguen mayúsculas.

## Entradas y normalización

- Texto requerido: debe ser string, se recortan espacios externos y se rechaza
  vacío. No se convierten números a texto: documentos y números de póliza conservan
  ceros iniciales. No se agregaron máximos arbitrarios a los String de Prisma.
- Email: se recortan espacios y se valida el formato; no se cambia a minúsculas.
- Teléfonos, documentos, patentes, estado civil y sexo: se validan como texto,
  sin imponer reglas de un país o convertir campos String en enumeraciones.
- Contraseña: no se recorta ni transforma; debe ser texto no vacío ni sólo
  espacios. El modelo Prisma no especifica una política de fortaleza: ese control
  deberá definirse al implementar autenticación. Antes de persistir, el backend
  debe sustituirla por un hash seguro; Zod no hace hashing ni verifica el hash.
- IDs: enteros positivos hasta 2147483647. Aceptan número o texto decimal de
  select/input y devuelven number. Rechazan vacío, null, booleanos, decimales,
  notación científica, hexadecimal y valores fuera de rango.
- Int/SmallInt: se respetan los rangos de PostgreSQL, sin inventar límites de
  negocio para el año o la matrícula. Un año razonable es una regla adicional
  que puede acordarse después.
- Boolean: sólo true/false reales. La cadena `"false"` nunca se convierte en true.
- Nullable: admite omisión, null y texto vacío o con espacios. Vacío se convierte
  en null, para permitir limpiar un campo opcional. Omitirlo conserva undefined;
  en una edición significa no modificarlo. Los obligatorios no se pueden limpiar.
- Fecha sin hora: string ISO `AAAA-MM-DD`, con validación de calendario. No se
  admiten timestamps para fecha de nacimiento, vencimiento o fecha de ocurrencia.
- Hora independiente: `HH:mm`, `HH:mm:ss` o fracciones de segundo, sin zona horaria.
- Instantes: ISO con Z u offset, por ejemplo `2026-10-13T12:30:00-03:00`.
  Se rechazan instantes sin zona. Los valores se conservan como strings para JSON.
- Fechas con `@default(now())`: se pueden omitir para dejar actuar al default
  de PostgreSQL. No se inventan defaults para fechas de asignación, solicitud o lectura.
- `inicioVigencia` sigue siendo texto opcional, igual que en Prisma.
- `tamanoBytes`: admite bigint, texto decimal o number entero seguro, entre 0 y
  9223372036854775807. Devuelve string decimal exacto, serializable como JSON;
  rechaza numbers inseguros para evitar pérdida de precisión.
- `urlArchivo` de plantilla y `urlArchivoSinDominio` guardan claves relativas de R2,
  generadas por el backend. Rechazan URLs, rutas absolutas, parámetros y segmentos
  `..`. Se permiten letras ASCII, números, puntos, guiones, guiones bajos y `/`.
  El nombre original se guarda por separado. Los metadatos del archivo no
  prueban su tamaño, contenido, MIME real ni permisos: verificarlos al subirlo.

La salida es un DTO para formularios/API; no es un `Prisma.CreateInput` directo.
El backend debe mapear las fechas a Date en UTC (para fechas de calendario,
usar medianoche UTC; para Time, una fecha fija con esa hora), y tamanoBytes a
BigInt. No aplicar conversiones de zona que desplacen un día de calendario.
No propagar un DTO completo directamente a Prisma sin seleccionar los campos
permitidos y completar los valores controlados por el servidor.

## Alcance y seguridad en la integración futura

Los esquemas validan datos, no conceden permisos. Los esquemas de notificaciones,
historial y lecturas permiten validar datos de operaciones internas; su existencia
no implica que deba haber formularios públicos o endpoints de edición para ellos.
Crear los payloads autorizados antes de utilizar estos esquemas.

El backend debe:

- Derivar autores y lectores de la sesión, y controlar asignaciones y roles.
  No confiar en `idUsuario`, `tipoUsuario`, última conexión ni marcas de tiempo
  recibidas desde el navegador sólo porque tengan un formato válido.
- Comprobar existencia y actividad de las FK, permisos sobre el siniestro,
  unicidad del email y de la pareja mensaje/lector. Estas verificaciones necesitan
  la base de datos y no se pueden resolver con validaciones Zod locales.
- Registrar la primera lectura sin sobrescribirla ni crear duplicados. El schema
  de MensajeChat ya no acepta `leido` ni `fechaLeido` globales.
- Evaluar reglas entre campos contra el registro completo, especialmente al
  recibir PATCH parciales: rangos de fechas, cierre de pericias o siniestros, etc.
  No se añadieron reglas de negocio que no estén definidas en el modelo.

`id`, `eliminado` y `fechaBaja` se excluyen de los esquemas de alta/edición general.
Las operaciones autorizadas de baja/restauración pueden validar por separado
`bajaLogicaSchema`: false exige fechaBaja=null; true exige un instante válido.
El servidor debe generar la fecha real de baja y realizar la actualización atómica.

## Verificación

Desde la raíz del repositorio, con Node >=22.12:

```sh
npm run typecheck -w shared
npm run lint -w shared
node --experimental-strip-types --test shared/tests/schemas.test.mjs
```

Las pruebas incluyen payloads de las 20 entidades, obligatoriedad/nullability,
campos desconocidos, cambios parciales, enums frente a Prisma, fechas inválidas,
IDs fuera de rango, booleanos, precisión BigInt y consistencia de bajas lógicas.
