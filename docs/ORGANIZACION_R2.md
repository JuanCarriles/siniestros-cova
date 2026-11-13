# Organización de los archivos en R2

## Buckets y entornos

Hay **un bucket por entorno**, y dentro de cada uno, la carpeta de su entorno con la misma estructura:

| Entorno    | Bucket               | Carpeta raíz  | `R2_ENTORNO` en `backend/.env` |
| ---------- | -------------------- | ------------- | ------------------------------ |
| Desarrollo | `siniestro-cova-dev` | `dev/`        | `dev` (también con Docker local) |
| Producción | `siniestros-cova`    | `produccion/` | `produccion`                   |

Los buckets separados no son solo orden: en Cloudflare los permisos de un token son por bucket, no por carpeta. Con un
solo bucket, un token o un script de desarrollo podría modificar o borrar archivos de producción.

`NODE_ENV=production` también se usa en Docker local, así que no alcanza para distinguir entornos: con
`NODE_ENV=production` la API no arranca si falta `R2_ENTORNO`. En desarrollo (tsx) sin valor se usa `dev`. Nunca se lee
ni se escribe una clave de la carpeta del otro entorno (403).

## Estructura

```
{entorno}/
  siniestros/{nºsiniestro}-{nºpóliza}/        documentos del expediente
      denuncia-administrativa-3f9a2c41.pdf
      dni-frente-8b07d1e2.webp                       imagen comprimida
      dni-frente-8b07d1e2.webp.miniatura.webp        su miniatura, al lado
  altas/{idUsuario}/                          borradores del alta (vencen solos a los 30 días)
  plantillas/                                 plantillas de documentos
      acta-de-cierre-c4e1a9b0.docx
  informes/{AAAA}/{AAAA-MM}-{código}.pdf      informes mensuales oficiales
  informes/pruebas/{AAAA}/{AAAA-MM}-{código}.pdf
  pruebas/                                    prueba de conexión con R2 (solo desarrollo)
```

### Siniestros

- **Una carpeta por siniestro**, con el número de siniestro y el de póliza: siniestro 1, póliza 1 → `siniestros/1-1/`;
  siniestro 2026-04871, póliza 01-AU-558812 → `siniestros/2026-04871-01-AU-558812/`.
- Se reserva en la base (`Siniestro.carpetaR2`) con la primera carga y **no cambia si después se editan los números**:
  así los documentos de un expediente nunca quedan repartidos entre dos carpetas.
- Si otro siniestro ya tiene esa carpeta (mismos números en distintas aseguradoras, o casos como siniestro "1-1"
  póliza "1" y siniestro "1" póliza "1-1"), el segundo lleva su id: `siniestros/1-1-id57/`. Nunca se mezclan
  documentos.
- Los caracteres que no van en una ruta se escapan de forma reversible: una barra (`A/B`) queda `A_2FB` y no crea una
  subcarpeta; los espacios, tildes y símbolos también se escapan (`_XX`).
- Un documento dado de baja sigue en su carpeta (baja lógica). El borrado definitivo del expediente borra sus archivos.

### Nombres de archivo

- **Nombre original limpio + código corto**: `DNI frente (1).jpg` → `dni-frente-1-3f9a2c41.jpg`. Sin tildes, espacios ni
  símbolos, en minúsculas, hasta 60 caracteres; si no queda nada legible, `archivo-<código>`. El código evita choques.
- El nombre real completo (con tildes y espacios) sigue guardado en la base y es el que se ve y se descarga en la app.
- Las versiones derivadas de una imagen agregan un sufijo al nombre del principal y quedan al lado:
  `.miniatura.webp` y, en las imágenes anteriores a la compresión, `.vista.webp`.
- `nombreLegibleR2` en `backend/src/lib/rutas-r2.ts`.

### Lo demás

- **Borradores del alta** (`altas/{idUsuario}/`): los archivos que se suben antes de que exista el siniestro. Al crearlo
  se copian a la carpeta del siniestro y se borran de acá. Lo que queda es de altas abandonadas: lo limpia la regla de
  vencimiento de Cloudflare (abajo).
- **Plantillas** (`plantillas/`): una carpeta, sin subcarpetas; son pocas y se buscan por nombre.
- **Informes mensuales** (`informes/{AAAA}/`): un archivo por mes, `2026-10-<código>.pdf`; las pruebas manuales van
  aparte, en `informes/pruebas/`. Antes era `informes mensuales/AAAA/MM/` (con un espacio en el nombre, incómodo para
  URLs y herramientas de línea de comandos); se siguen leyendo.
- **Pruebas** (`pruebas/`): solo la usan la demo y la prueba de conexión de R2 en desarrollo. En producción no
  debería existir.
- **Backups**: van en otro bucket (`siniestros-cova-backups`), con su propio token que no puede tocar los documentos.
  Ahí `backups/db/` tiene los dumps cifrados y `backups/documentos/actual/` una copia espejo del bucket de documentos
  (con la misma estructura, incluida la carpeta del entorno); lo que se borra o se reemplaza pasa a
  `backups/documentos/historial/<fecha>/`. El servicio de backup copia por defecto la carpeta de `R2_ENTORNO` y las
  carpetas anteriores de la raíz (`siniestros/`, `plantillas/`).

## Reorganizar los archivos existentes

`npm run r2:reorganizar` lleva todo lo que la base conoce a la estructura de arriba:

- documentos de cada siniestro a `{entorno}/siniestros/{nºsiniestro}-{nºpóliza}/`, con nombre legible (incluye los del
  formato anterior: `siniestros/{id}/` y `{entorno}/siniestros/{número}/{póliza}/`);
- plantillas a `{entorno}/plantillas/`, con nombre legible;
- informes a `{entorno}/informes/{AAAA}/{AAAA-MM}-{código}.pdf`.

Cómo trabaja:

- Primero copia, comprueba que la copia exista y recién después actualiza la base, siniestro por siniestro y con el
  mismo bloqueo que la carga de documentos. Si una copia falla, ese siniestro conserva sus referencias anteriores.
- **No borra nada.** Lo anterior queda en el bucket y aparece en el informe de sobrantes.
- Un reintento llega a los mismos nombres (el código sale del nombre anterior): no duplica documentos, no cambia
  fechas, no cuenta como movimiento ni vuelve a notificar.
- Un siniestro con archivos de otro entorno o fuera de su carpeta (por ejemplo, cargados con un Docker local sin
  `R2_ENTORNO`, o documentos de un alta que quedaron apuntando a `altas/`) **se omite** y se informa, para revisarlo a
  mano; los demás siguen.
- Un siniestro sin documentos que tenía reservada una carpeta del formato anterior la libera: la próxima carga reserva
  la nueva.

### Sobrantes

Al final lista lo que está en el bucket y **ninguna referencia de la base usa**, agrupado por carpeta y con su tamaño:
copias anteriores ya reorganizadas, pruebas viejas, archivos de otro entorno. Los borradores del alta no cuentan (vencen
solos). **No se borra ninguno**: se retiran a mano desde Cloudflare, después de verificar. Con `--listar-sobrantes`
muestra cada archivo.

### Pasos

En la PC (desarrollo), desde la raíz:

```
npm run r2:reorganizar -w backend -- --entorno=dev
npm run r2:reorganizar -w backend -- --entorno=dev --aplicar
```

En el VPS (producción):

1. Backup en el momento: `sh scripts/backup-ahora.sh`.
2. Simular: `docker compose exec backend node --env-file-if-exists=.env dist/reorganizar-r2.mjs --entorno=produccion`.
   Revisar los siniestros omitidos y los sobrantes.
3. Aplicar: lo mismo con `--aplicar`.
4. Probar en la app: abrir documentos, imágenes, plantillas e informes de algunos casos.
5. Esperar al backup del día siguiente (o correr `sh scripts/backup-ahora.sh`) y verificar con
   `sh scripts/probar-backups.sh`.
6. Recién ahí, retirar los sobrantes desde Cloudflare (`--listar-sobrantes` los muestra uno por uno).

## Regla de vencimiento de los borradores en Cloudflare

En cada bucket, **Settings → Object lifecycle rules**: borrar a los 30 días lo que esté en `{entorno}/altas/` (y en
`altas/` mientras queden borradores del formato anterior). No aplicar vencimiento a siniestros, plantillas ni informes.
Esto no se configura automáticamente.

## Verificación

- Crear un caso con siniestro 1 y póliza 1, subir un PDF y una foto desde el alta y desde la ficha: todo en
  `{entorno}/siniestros/1-1/`, con nombres legibles, la imagen y su miniatura juntas.
- Otro caso con los mismos números en otra aseguradora: `siniestros/1-1-id<N>/`.
- Editar los números de un caso con documentos: los nuevos siguen yendo a la carpeta reservada.
- Pedir una clave del otro entorno: 403.
- Pruebas: `npm run test:rutas-r2 -w backend` y `npm run test:rutas-r2:db -w backend`.
