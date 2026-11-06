# Tipo real, tamaño y descargas de archivos (E6-03, CU-10)

La política compartida está en `shared/src/schemas/archivos.ts`: PDF, JPG/JPEG, PNG, DOCX y XLSX; máximo de 10 MiB (10 × 1024 × 1024 bytes), mostrado como 10 MB.

## Validación por contenido

El navegador comprueba tamaño y archivos vacíos para dar una respuesta inmediata. El atributo `accept` ayuda a seleccionar formatos habituales, pero la extensión no autoriza ni rechaza el contenido. Se pueden arrastrar archivos con nombre equivocado o sin extensión.

El validador común del backend está en `backend/src/lib/validar-archivo.ts`. Detecta las firmas binarias con file-type y devuelve la extensión y el MIME reales. Se usa en plantillas, alta, ficha y en la subida genérica de R2. El Content-Type declarado por el navegador y la extensión del nombre no deciden el formato.

Se aceptan, por ejemplo, un PNG llamado `foto.jpg`, un PDF sin extensión y un DOCX llamado `carta.xlsx`. Se conserva `nombreOriginal` para mostrarlo, pero la clave del objeto, `tipoExtension` y `mimeType` se derivan del contenido. Las plantillas no tienen columna MIME: para firmar la descarga se obtiene del `tipoExtension` validado guardado en la base. La demo local lo obtiene de la extensión canónica de la clave generada por el backend.

DOCX y XLSX comparten la firma ZIP: además se inspecciona el contenedor para distinguirlos. Un ZIP genérico, ejecutable o HTML renombrado como PDF se rechaza porque su contenido no está permitido. Los JPG/PNG del expediente pasan además por sharp; la política de compresión acordada sigue aplicándose aunque el nombre tenga otra extensión. WebP se genera internamente y no se permite como entrada del usuario.

El límite se controla en multipart y después de descomprimir el transporte gzip; comprimir un archivo mayor a 10 MB no permite eludirlo. Se acepta exactamente el máximo y se rechaza cualquier byte adicional con HTTP 413. Los errores de formato, recepción, descompresión, archivo vacío y tamaño incluyen formatos permitidos y máximo.

Nginx devuelve un JSON equivalente si rechaza el cuerpo antes de llegar al backend. Su límite de 11m deja margen para multipart. El comentario de `app.conf` indica que, si cambia `ARCHIVO_MAX_MB`, deben actualizarse ese margen y el mensaje de `@archivo_grande`; una prueba comprueba la coincidencia del mensaje con shared.

## Descargas

Los objetos nuevos y sus derivados se guardan con Content-Disposition attachment. Todas las URLs firmadas fuerzan `ResponseContentDisposition: attachment` y `ResponseContentType`: MIME guardado para el principal y `image/webp` para miniaturas y vistas derivadas. Esto corrige la respuesta incluso si el objeto anterior tenía metadata inline o un Content-Type diferente. La firma no reescribe los objetos existentes.

El nombre de descarga lleva una extensión coherente con el contenido guardado: `foto.jpg` con bytes PNG se descarga como `foto.png`; si sharp guarda WebP, como `foto.webp`. Se conserva UTF-8 con filename*, sin permitir inyección de cabeceras. El nombre recibido sigue visible en el sistema.

La grilla y el visor de imágenes usan los recursos firmados como img. El bucket sigue privado; firmas de 60 segundos por defecto, máximo 300, y permisos verificados antes de generarlas. Nunca se guarda la URL completa en la base.

## Prueba manual

1. Arrastrar un PNG llamado `foto.jpg` y un PDF sin extensión: deben subirse y conservar el nombre visible. Al descargar, la extensión debe corresponder al formato real.
2. Renombrar un TXT o ejecutable como `.pdf`: debe rechazarse con formatos y máximo, también desde la API directa.
3. Subir PDF, JPG, PNG, DOCX y XLSX reales menores de 10 MB; probar una foto grande con extensión equivocada y comprobar su compresión y miniatura.
4. Intentar subir más de 10 MB y comprobar el mensaje en selección, backend y proxy.
5. Revisar en Network la respuesta final de R2: Content-Disposition attachment y Content-Type del archivo validado; miniaturas image/webp. Comprobar que Ampliar y la grilla funcionen.

## Integración

Esta corrección incorpora la rama corregida `feat/comprimir-imagenes`, con sus dependencias de desarrollo y E6-01. E6-03 no agrega migraciones ni dependencias; la integración sí conserva las migraciones de esas ramas. No se aplicaron a la base del usuario durante las pruebas. Con Docker, reconstruir los servicios para usar el código integrado: `docker compose up -d --build`.
