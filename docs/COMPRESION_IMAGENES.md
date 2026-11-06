# Imágenes del expediente (E6-02, CU-10)

## Política acordada para controlar almacenamiento

Se eligió guardar el archivo optimizado del expediente y una miniatura, sin conservar una copia adicional del original cuando se reduce. Se aplica a nuevas cargas desde la ficha y desde el alta.

- JPG/JPEG y PNG cuyo lado largo supera 1600 px: sharp corrige orientación EXIF y produce WebP con lado largo máximo de 1600 px, calidad 80 y alfa de calidad 100. Solo guarda este resultado si pesa menos que la entrada.
- Si la imagen ya tiene 1600 px o menos, no se recomprime ni se amplía el archivo del expediente.
- Si la reducción WebP pesa lo mismo o más que la entrada, conserva los bytes de entrada. Es una excepción explícita al máximo de 1600 px para evitar aumentar almacenamiento o degradar una imagen sin beneficio.
- Miniatura privada de hasta 300 px, sin recortar ni ampliar. Usa WebP calidad 80; en dibujos donde resulte pesado, elige WebP sin pérdida si reduce el tamaño. La miniatura es un archivo pequeño adicional, por lo que no se promete ahorro total en cada imagen pequeña.
- PDF, DOCX y XLSX no se procesan ni se alteran. Las imágenes deben ser estáticas válidas de hasta 40 millones de píxeles; el máximo de entrada sigue siendo 10 MB.

Las nuevas imágenes no generan una tercera copia de vista. `/vista` muestra el mismo archivo principal guardado. El visor y la descarga no prometen un original de mayor resolución que ya no se conserva. Antes de elegir archivos, la ficha y el alta explican esta política.

Reducir tamaño/resolución no permite garantizar legibilidad de cualquier letra diminuta. Verificar fotos y escaneos representativos antes de desplegar; la versión v1 no tiene reconocimiento automático de texto. Esta política fue elegida expresamente frente a conservar siempre los originales.

## Formatos, nombres y metadatos

El nombre recibido se registra en `nombreOriginal`. `tipoExtension`, `mimeType` y `tamanoBytes` describen el archivo que se guardó. Por ejemplo, una foto llamada `acta.jpg` puede guardarse como WebP y descargarse como `acta.webp`. El SHA-256 usado para idempotencia continúa calculándose sobre los bytes recibidos antes de procesarlos.

Los campos `anchoOriginal/altoOriginal` registran las medidas recibidas (orientadas); `anchoImagen/altoImagen` las medidas guardadas. `tamanoOptimizadoBytes` contiene el tamaño guardado para el contrato de imagen existente. `claveImagenOptimizada` queda NULL para imágenes nuevas: no existe una copia adicional de vista. Se mantiene la columna para referencias a archivos anteriores.

El backend escribe metadatos `imagen-v2` en el objeto principal. El alta los lee desde R2 para copiar solo principal y miniatura y registrar su formato/tamaño reales; no confía en las medidas o formato enviados por el navegador.

## Compatibilidad y limpieza

- Los documentos ya guardados no se recomprimen, sobrescriben ni borran. Se siguen leyendo los metadatos `imagen-v1` y sus tres archivos, incluidos borradores de alta existentes.
- La migración original `20261107130000_imagenes_documentos` se conserva sin cambios, porque ya pudo aplicarse. No hace falta una migración nueva para esta corrección.
- La compensación elimina los archivos de una carga fallida; una confirmación perdida no borra objetos referenciados. Reintentar no duplica el documento, movimiento, historial ni avisos.
- El borrado definitivo del expediente incluye todos sus archivos referenciados: dos para imágenes nuevas y hasta tres para las anteriores. Las bajas lógicas conservan los archivos.
- No se limpian automáticamente vistas antiguas de R2: conservarlas evita eliminar archivos que otras versiones desplegadas todavía pueden utilizar.

## Acceso y rendimiento

Los endpoints `/miniatura`, `/vista` y `/original` mantienen sesión, rol vigente, permiso sobre el expediente y pertenencia del documento. Guardan claves relativas y entregan URLs firmadas cortas; no hay bucket público ni credenciales en el frontend.

Las miniaturas no hacen HEAD adicional: si el objeto no está disponible, el `onError` existente muestra el aviso visual. El archivo principal mantiene la comprobación de disponibilidad. Los nombres de vistas/miniaturas parten del nombre recibido y llevan extensión WebP cuando corresponde. Las firmas fuerzan attachment y el MIME del principal guardado; las de derivados fuerzan image/webp, aunque R2 conserve metadata diferente. El formato de entrada se detecta por contenido, también si el nombre tiene otra extensión.

sharp sigue ejecutándose en la petición con el límite de 40 MP. No se cambió su concurrencia global sin mediciones de carga.

## Ejecución y pruebas

Con npm: `npm install`, `npm run prisma:migrate:deploy -w backend`, `npm run prisma:generate -w backend`. Con Docker: `docker compose up -d --build`. No se modificaron Dockerfile ni Compose.

Desde backend:

```powershell
node --experimental-strip-types --test tests/imagenes-documento.test.mjs
node --experimental-strip-types --env-file-if-exists=.env --test tests/imagenes-documento.db.test.mjs
```

La prueba integrada usa una base temporal y R2 simulado. Comprueba dos objetos, ahorro en una foto grande, tamaño/formato registrados, original no subido como copia, metadatos v1/v2, alta y descarte, acceso privado sin HEAD para miniaturas, reintentos y limpieza. No altera archivos reales ni datos locales.

Prueba manual: cargar una foto grande y verificar dos objetos en R2, descargar y comprobar WebP de hasta 1600 px; cargar una imagen de menos de 1600 px y verificar que su archivo conserve exactamente sus bytes; cargar un PDF y comprobar que no genere derivados. Verificar orientación, transparencia y legibilidad del contenido que utiliza el estudio.
