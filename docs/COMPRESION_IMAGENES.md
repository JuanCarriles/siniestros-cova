# Imágenes del expediente (E6-02, CU-10)

Depende de E6-01, incorporada desde `feat/subir-documento-siniestro`.

## Qué se guarda

Para JPG/JPEG y PNG nuevos, tanto en la ficha como en el alta:

- Original intacto, con su nombre y tamaño reales. Nunca se reemplaza por una copia reducida.
- Vista WebP con sharp: lado largo máximo de 1600 px y calidad 80.
- Miniatura WebP: lado largo máximo de 300 px y calidad 80, para la grilla.

Se respeta la proporción, se corrige orientación EXIF, se mantiene transparencia y no se amplían imágenes pequeñas.
Los PDF, DOCX y XLSX no pasan por sharp: sus bytes se conservan sin cambios.
Las entradas deben ser JPG/PNG estáticos válidos, de hasta 10 MiB y 40 millones de píxeles. Una imagen dañada se rechaza antes de subir objetos.

## Legibilidad

La miniatura sirve para identificar el archivo; la vista de 1600 px sirve para consultarlo. No es posible garantizar que todo texto diminuto de cualquier escaneo siga siendo legible al reducirlo. Por eso siempre se conserva y permite descargar el original, sin recomprimirlo, recortarlo ni perder resolución. El diálogo explica esta diferencia y muestra las medidas de ambas versiones.

## Acceso y datos

El bucket sigue siendo privado. La base almacena claves relativas y medidas/tamaño, nunca URLs completas.
Los endpoints `GET /api/siniestros/:id/documentos/:idDocumento/miniatura`, `/vista` y `/original` validan sesión, rol actual, acceso al caso y pertenencia del documento antes de comprobar R2 y redirigir a una URL firmada corta. El original se descarga; los derivados se muestran inline. No se usan URLs públicas ni credenciales en el frontend.

La metadata `imagen-v1` del original en R2 la escribe el backend; permite al alta copiar y registrar las variantes sin confiar en datos de imágenes recibidos del navegador.
Un fallo al guardar variantes o la transacción limpia los objetos sobrantes. Los reintentos idempotentes de E6-01 se conservan. El borrado físico del expediente incluye original, vista y miniatura.

## Migración y ejecución

`20261107130000_imagenes_documentos` añade siete columnas opcionales; no transforma ni elimina archivos o registros anteriores. Las imágenes anteriores continúan descargables, sin miniatura, hasta volver a cargarlas. No hay procesamiento retroactivo automático.

Con npm: `npm install`, `npm run prisma:migrate:deploy -w backend` y ejecutar backend/frontend. Con Docker: `docker compose up -d --build`. No se cambiaron Dockerfiles ni Compose; sharp se instala desde el lockfile en la imagen Linux.

## Prueba manual

1. Subir una foto JPG y un PNG con texto/transparencia a un siniestro activo.
2. Comprobar miniatura en la grilla y abrir Ampliar; verificar proporción y orientación.
3. Descargar el original y comprobar que conserva su resolución y tamaño original.
4. Subir un PDF y verificar que no recibe derivados ni cambia su contenido.
5. Repetir desde el paso Documentos del alta y confirmar el siniestro.
6. Un gestor ajeno al expediente no debe acceder a ninguna de sus tres versiones.
7. Al borrar físicamente el expediente deben desaparecer las tres claves de R2.
