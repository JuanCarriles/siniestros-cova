# Triggers del sistema y contrato estadístico

Los triggers se ejecutan en PostgreSQL, dentro de la misma transacción que la operación que los dispara. Si esa operación se revierte, también se revierten las escrituras de los triggers. No envían correos ni hacen llamadas a R2.

## Inventario de triggers de aplicación

No se incluyen los triggers internos de claves foráneas. El inventario se comprueba contra `pg_trigger` en una base temporal con todas las migraciones aplicadas.

| Trigger | Tabla y momento | Función | Escritura y propósito |
| --- | --- | --- | --- |
| `notificacion_cambio_tiempo_real` | `Notificacion`, AFTER INSERT, UPDATE o DELETE | `cova_avisar_cambio_notificacion` | Emite NOTIFY al confirmar la transacción. Lleva solo destinatario e indicador de contenido nuevo; no copia datos del siniestro. |
| `historial_autor_al_registrar` | `HistorialSiniestro`, BEFORE INSERT | `historial_autor_al_registrar` | Completa `autorNombre` y `autorTipoUsuario` en la propia fila: conserva quién actuó aunque luego cambie el perfil. |
| `actividad_siniestro_al_registrar` | `HistorialSiniestro`, AFTER INSERT, si no está eliminado | `actividad_siniestro_al_registrar` | Inserta en `ActividadSiniestro` una instantánea para el dashboard. Sobrevive al borrado del expediente y del historial particular. |
| `estadistica_caso` | `Siniestro`, AFTER INSERT o UPDATE | `cova_estadistica_caso` | Registra ALTA o DATOS en `RegistroEstadisticoSiniestro`. Los cambios exclusivamente técnicos se excluyen. |
| `estadistica_borrado` | `Siniestro`, BEFORE DELETE | `cova_estadistica_caso` | Conserva la última foto con ELIMINACION antes de que desaparezca el expediente. |
| `estadistica_perito` | `Perito`, AFTER INSERT, UPDATE o DELETE | `cova_estadistica_parte` | Foto PARTES del caso para indicadores de pericias. |
| `estadistica_persona` | `PersonaInvolucrada`, AFTER INSERT, UPDATE o DELETE | `cova_estadistica_parte` | Foto PARTES para lesiones, menores y representación de terceros. |
| `estadistica_vehiculo` | `Vehiculo`, AFTER INSERT, UPDATE o DELETE | `cova_estadistica_parte` | Foto PARTES: considera vehículos y sus personas vigentes. |
| `estadistica_abogado` | `Abogado`, AFTER UPDATE | `cova_estadistica_abogado` | Foto PARTES de cada caso vinculado a las personas representadas. |
| `estadistica_historial` | `HistorialSiniestro`, AFTER INSERT | `cova_estadistica_evento` | Registra cambios de estado, asignaciones, reasignaciones, bajas y reactivaciones con autor y fecha. No copia todos los tipos de historial. |
| `estadistica_documento` | `DocumentoSiniestro`, AFTER INSERT | `cova_estadistica_evento` | Registra DOCUMENTO con autor y fecha de carga. No copia el archivo ni cuenta la reactivación como carga nueva. |
| `estadistica_novedad` | `NovedadSiniestro`, AFTER INSERT | `cova_estadistica_evento` | Registra NOVEDAD con autor y fecha. No copia el texto. |

`cova_registrar_estadistica` es la función auxiliar que escribe el registro; `cova_datos_estadisticos` arma la foto JSON. No son triggers independientes. El historial particular (`HistorialSiniestro`), la actividad global (`ActividadSiniestro`) y el registro para informes cumplen propósitos diferentes: no deben sumarse entre sí para contar una misma acción.

Las migraciones relevantes son `20261106120200_historial_autor`, `20261112120000_informe_mensual`, `20261112180000_carpetas_r2` y `20261112200000_actividad_dashboard_persistente`. La migración de carpetas redefine `cova_estadistica_caso` para excluir `carpetaR2`. No modificar migraciones ya aplicadas: cualquier cambio futuro del SQL requiere otra migración.

## Decisión sobre cada columna de Siniestro

El contrato explícito está en `backend/tests/fixtures/estadistica-siniestro.mjs`, separado de Prisma y del SQL:

- **Foto:** identidad del caso, ingreso/ocurrencia, estado, aseguradora, ajustador, responsable, baja vigente, cierre, último movimiento, menores, moneda, importes y resultado. La fixture indica la ruta JSON que corresponde a cada columna.
- **Evento sin contenido:** número de póliza, hora del hecho, vigencia, sucursal, causa, dirección y fecha de baja. Su modificación dispara DATOS, pero no se duplica su contenido en la foto: no hay un indicador que lo requiera, el relato y el domicilio se omiten, y la baja ya tiene evento/fecha propios.
- **Técnicas excluidas:** `revision`, `eliminacionEnCurso` y `carpetaR2`. No son actividad del expediente ni deben alterar las estadísticas al reservar carpetas o coordinar operaciones.

Una columna nueva, eliminada o renombrada hace fallar la comparación con `information_schema.columns`. Antes de actualizar la fixture, decidir qué indicador la necesita, si debe disparar una foto y qué datos no corresponde duplicar. Si cambia esa política, revisar también el SQL, el cálculo del informe y esta documentación. El contrato no se regenera automáticamente desde el esquema.

## Pruebas

Desde la raíz: `npm run test:migraciones:db -w backend`. Incluye `triggers-estadistica.db.test.mjs`, que crea y elimina una base temporal local; no carga datos de prueba en la base del sistema. Comprueba el inventario, las decisiones de columnas, el rechazo de una columna nueva sin decisión, las rutas de la foto y la ausencia de eventos por cambios técnicos.

Las suites `test:informes:db`, `test:actividad:db` y `test:rutas-r2:db` comprueban, además, la conservación estadística, la actividad tras borrar un siniestro y la reorganización de referencias. Las llamadas a almacenamiento y correo se simulan.

La migración `20261113210000_notificaciones_tiempo_real` agrega el aviso de bandeja. Cada API escucha `cova_notificaciones` en una conexión dedicada. Los rollbacks no avisan. Lectura/revisión cambian el contador sin quitar del panel los avisos que acaba de mostrar. Un reagrupado con contenido nuevo sí actualiza la lista. La reconexión resincroniza los contadores mediante la API autenticada.
