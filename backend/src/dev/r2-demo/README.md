# Interfaz desechable para probar archivos en R2

Desde la raíz del proyecto:

```powershell
npm run r2:demo -w backend
```

Abrir **http://127.0.0.1:3033** y mantener la terminal abierta. Ctrl+C detiene
el servidor. Usa las dependencias ya instaladas y las credenciales de `backend/.env`.
Funciona junto a Docker sin reconstruir imágenes; esta demo no necesita PostgreSQL.

1. Elegir o arrastrar una foto/documento y presionar **Subir a R2**.
2. Presionar **Generar enlace** y **Descargar archivo**. El archivo se descarga
   directamente desde R2 con una URL firmada por el backend.
3. Presionar **Comprobar en R2** para descargar desde el servidor y comparar
   tamaño y SHA-256 con los bytes originales. Esto no necesita configurar CORS en R2.
4. Esperar el contador y volver a comprobar el mismo enlace: R2 debe rechazarlo.
   **Generar un nuevo enlace** permite descargar otra vez.
5. Eliminar los archivos de prueba con **Eliminar de R2** o la limpieza general.

Los archivos reales se guardan en `pruebas/UUID.ext` dentro del bucket configurado.
Se conservan hasta eliminarlos; el vencimiento de un enlace no elimina el objeto.
El registro local en `backend/.r2-demo/archivos.json` permite reencontrarlos al
reiniciar. Guarda claves, nombres, tamaños y hashes; no guarda URLs ni credenciales.
No borrar ese registro antes de limpiar los objetos. Está excluido de Git y Docker.

La pantalla sólo conoce los archivos de su registro. No lista ni elimina todos los
objetos del bucket. Las fotos originales de la computadora no se modifican.
El límite por archivo y las extensiones se toman de la configuración existente;
el máximo de la demo es 50 archivos registrados. El MIME se deduce de la extensión;
esta herramienta no implementa análisis de malware ni validación profunda del formato.

Es una herramienta local: escucha únicamente en 127.0.0.1, rechaza hosts/orígenes
externos y exige un token temporal para subir, firmar, comprobar o eliminar.
No se inicia con NODE_ENV=production, no está montada en la API principal y no
forma parte del build de producción. No publicarla mediante túneles o proxies.

Esta prueba usa el adaptador R2 del backend directamente. No crea usuarios,
siniestros ni documentos de negocio en PostgreSQL. El comando existente
`npm run r2:smoke -w backend` sigue verificando R2 más el guardado con Prisma.

## Pruebas y retiro de la demo

```powershell
npm run test:r2-demo -w backend
```

Para retirarla, primero limpiar sus archivos desde la pantalla y detener el
servidor. Después se pueden quitar `src/dev/r2-demo`, `tests/r2-demo.test.mjs`,
la carpeta local `.r2-demo` y los scripts `r2:demo`/`test:r2-demo` de package.json.
El servicio R2 original y la integración con Prisma seguirán disponibles.
