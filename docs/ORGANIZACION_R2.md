# Carpetas de documentos y separación de entornos

## Configuración

En `backend/.env` definir `R2_ENTORNO=dev` para la PC, incluso con Docker, y `R2_ENTORNO=produccion` en el VPS. `NODE_ENV=production` también se usa en Docker local: no alcanza para distinguir entornos. Si no se define R2_ENTORNO, el fallback es produccion en NODE_ENV=production y dev en el resto. Se recomienda un bucket/token distinto por entorno además del prefijo; la separación de carpetas no sustituye los permisos del bucket.

```
dev/
  siniestros/1/1/uuid.pdf
  siniestros/1/1/uuid.webp
  siniestros/1/1/uuid.webp.miniatura.webp
  altas/ID_USUARIO/uuid.pdf
  plantillas/uuid.pdf
  pruebas/uuid.pdf
  informes mensuales/AAAA/MM/uuid.pdf
produccion/
  siniestros/1/1/uuid.pdf
  altas/ID_USUARIO/uuid.pdf
  plantillas/uuid.pdf
  informes mensuales/AAAA/MM/uuid.pdf
```

La ruta usa los números visibles, no las PK: `ENTORNO/siniestros/NUMERO_SINIESTRO/NUMERO_POLIZA/`. No se introducen extensiones de imagen ni políticas de compresión nuevas.

Una columna nullable y única, Siniestro.carpetaR2, reserva la carpeta lógica. La migración excluye esa reserva técnica del disparador estadístico: no inventa movimientos ni actividad para el informe mensual. Si dos aseguradoras tienen la misma combinación, el primer caso reserva 1/1 y el otro usa 1/1/siniestro-ID_INTERNO. El bloqueo de caso y de la reserva evita colisiones concurrentes. No se mezclan documentos.

La carpeta conserva el nombre de los números al reservarla, aunque se editen después, para no romper descargas ni repartir un expediente entre rutas. Los documentos nuevos del mismo caso usan esa reserva. Los slash y caracteres especiales que formen parte de un número se escapan reversiblemente: `A/B` se representa como `A_2FB`; no se confunde con `A-B` ni con `A_2FB` (el underscore también se escapa).

## Archivos anteriores

No se mueve ni elimina ningún objeto al aplicar la migración SQL. Los documentos anteriores `siniestros/ID/`, plantillas, informes y borradores sin entorno continúan funcionando. No se permite usar claves explícitas del otro entorno.

La herramienta solo recorre los archivos referenciados en la base seleccionada, incluidos documentos dados de baja y miniaturas. No enumera ni elimina el bucket completo. Simular no escribe en R2 ni en la base.

Primero desplegar la migración y el código, verificar los valores R2_ENTORNO, DATABASE_URL y R2_BUCKET del servidor. Desde la raíz:

```
npm run r2:reorganizar -w backend -- --entorno=dev
npm run r2:reorganizar -w backend -- --entorno=dev --aplicar
```

En el VPS con Docker (reemplazar backend por el nombre real del servicio si difiere):

```
docker compose exec backend node --env-file-if-exists=.env dist/reorganizar-r2.mjs --entorno=produccion
docker compose exec backend node --env-file-if-exists=.env dist/reorganizar-r2.mjs --entorno=produccion --aplicar
```

Primero copia los archivos, comprueba su existencia y luego actualiza las referencias. En cada siniestro, la actualización de principal/vista/miniatura es transaccional y toma el mismo bloqueo del caso que la carga y el borrado. Si una copia falla se conservan las referencias anteriores. Un reintento completa lo que falta sin crear documentos adicionales, alterar fechas, cambiar el último movimiento ni volver a notificar.

Por seguridad, conserva los objetos originales sin prefijo: otra base antigua podría referenciarlos. Solo retirar esos originales después de migrar y comprobar todos los entornos y sus backups. No es posible demostrar desde una sola base que ningún otro sistema los utiliza. Las copias sobrantes de un intento fallido se pueden sobrescribir al reintentar; nunca se borran a ciegas.

## Regla de vida de temporales en Cloudflare

Mantener la regla anterior sobre `altas/` mientras existan borradores antiguos. Agregar reglas equivalentes de expiración a 30 días para `dev/altas/` y `produccion/altas/`. No aplicar expiración a siniestros, plantillas ni informes. No se cambia la configuración de Cloudflare automáticamente desde esta corrección.

## Verificación

Generar un caso con siniestro 1 y póliza 1, subir PDF y foto desde el alta y desde la ficha. Comprobar carpeta del entorno, un registro de documento por carga, imagen principal y miniatura juntas, visor y descargas. Reintentar con otro entorno: debe rechazarse el acceso a claves con prefijo ajeno. Editar los números y comprobar que se sigue usando la carpeta reservada. Probar dos casos de distintas aseguradoras con iguales números: se separan por ID interno.

No se modificaron en esta tarea las reglas de actividad reciente, el comportamiento de duplicados ni la reactivación de documentos.
