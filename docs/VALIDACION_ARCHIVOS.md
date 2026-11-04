# Tipo real, tamaño y descargas de archivos (E6-03, CU-10)

La política compartida está en `shared/src/schemas/archivos.ts`: PDF, JPG/JPEG, PNG, DOCX y XLSX; máximo de 10 MiB (10 × 1024 × 1024 bytes), mostrado como 10 MB.

## Validación

El navegador comprueba nombre y tamaño para dar una respuesta inmediata. Esta comprobación es solo orientativa: el servidor controla el tamaño real del buffer y detecta las firmas binarias con file-type antes de contrastar la extensión. El Content-Type enviado por el navegador no se usa para confiar en el formato.

DOCX y XLSX comparten la firma ZIP: además se inspecciona el contenedor para distinguirlos. Un ZIP genérico, un ejecutable, HTML o un archivo renombrado no se acepta por tener una extensión permitida. Se permite `.jpeg` como alias de `.jpg` y extensiones en mayúsculas.

El límite se controla en multipart y también después de descomprimir el transporte gzip; un archivo comprimido pequeño no permite introducir un original mayor a 10 MB. Se acepta exactamente el máximo y se rechaza cualquier byte adicional. Los JPG/PNG pasan además por el decodificador de sharp.

Los errores por formato, archivo vacío, tamaño, recepción y descompresión incluyen los formatos permitidos y el máximo. La misma política se usa en el alta, la ficha del siniestro y plantillas. Nginx devuelve un JSON equivalente si rechaza un cuerpo antes de llegar al backend.

## Descargas

Los objetos originales y derivados nuevos se guardan con Content-Disposition attachment. Todas las URLs firmadas fuerzan también attachment, de modo que aplica a archivos anteriores aunque su metadata fuese inline. Se conserva el nombre mediante filename* UTF-8, sin permitir inyección de cabeceras.

El visor y la grilla siguen utilizando los derivados como recursos img; abrir o descargar el archivo directamente lo trata como adjunto. El bucket permanece privado, las firmas vencen en el plazo configurado (60 segundos por defecto, máximo 300) y los permisos se validan antes de generarlas. Nunca se guarda la URL completa en la base.

## Prueba manual

1. Renombrar un TXT o ejecutable como `.pdf`: el backend debe rechazarlo y mostrar formatos y máximo, incluso enviándolo directamente a la API.
2. Subir un PDF, JPG, PNG, DOCX y XLSX reales de menos de 10 MB.
3. Intentar subir un archivo mayor a 10 MB; comprobar el mismo mensaje en selección, backend y proxy.
4. Descargar un archivo y revisar en la pestaña Network del navegador la respuesta final de R2: Content-Disposition empieza con attachment e incluye filename*.
5. Comprobar que Ampliar y las miniaturas continúan funcionando.

No se requieren migraciones, cambios de esquema ni dependencias nuevas. La configuración de Nginx requiere reconstruir el frontend en Docker con `docker compose up -d --build`.
