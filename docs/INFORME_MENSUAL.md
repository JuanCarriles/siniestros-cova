# Informe mensual de siniestros (RF-30)

## Puesta en marcha y prueba manual

1. Se incorpora la migración `20261112120000_informe_mensual`. Es aditiva: no resetea la base ni ejecuta la seed de desarrollo.
2. En `backend/.env`, habilitar temporalmente `INFORMES_PRUEBA_HABILITADOS=true`. Mantener las credenciales R2 y Resend solo en el servidor.
3. Docker: `docker compose up -d --build`. El servicio migrate existente aplica las migraciones antes de arrancar la API. Desarrollo con npm: `npm run prisma:migrate:deploy -w backend`, luego iniciar back y front.
4. Entrar como superadministrador a **Informes**, elegir el mes actual y **Generar prueba**. El mes actual es provisional. El correo está desmarcado de inicio.
5. Descargar el PDF. En R2 buscar `informes mensuales/pruebas/AAAA/MM/`. Solo se sube el PDF.
6. Para probar el correo, marcar la opción de envío o usar **Enviar correo** sobre una prueba guardada. El destinatario es el superadministrador activo de la base, no un email arbitrario enviado por el navegador.
7. Deshabilitar `INFORMES_PRUEBA_HABILITADOS=false` al terminar. La sección de consulta sigue disponible.

## Ejecución automática

`INFORMES_AUTOMATICOS=true` por defecto. Cada 15 minutos se revisa si corresponde generar un período pendiente. El día 1, a partir de las 07:00 en `America/Argentina/Buenos_Aires`, genera el mes anterior. Tras un reinicio recupera meses pendientes desde que existe el registro estadístico, uno por vuelta.

El informe oficial es único por período (`clavePeriodo`). Una concesión en PostgreSQL evita dos generadores simultáneos y permite recuperar ejecuciones interrumpidas después de 15 minutos. La fecha de la concesión evita que un proceso viejo confirme sobre un reintento. Los objetos tienen una clave propia por ejecución y se compensan si falla el guardado. No se reemplaza un informe oficial listo.

Se guarda primero el PDF en el bucket privado, luego se confirma el registro y después se envía el correo con el PDF adjunto. Un fallo de correo conserva el informe. El proveedor recibe una clave de idempotencia estable por informe; la marca de envío persistida evita reenviar después de un éxito confirmado. `correoEnviado` indica aceptación por Resend, no prueba de entrega en la bandeja del destinatario. Los errores se muestran sin credenciales.

## Datos y conservación

- `Siniestro`: monto reclamado, monto acordado, moneda ARS/USD y resultado del cierre. Importes Decimal(16,2), no floats en PostgreSQL. El reclamo se carga en Datos del caso; el cierre lo confirma la administración con resultado e importe si hubo acuerdo. Vacío no equivale a cero. Una reapertura limpia el resultado y monto del cierre actual; las instantáneas anteriores los conservan.
- `RegistroEstadisticoSiniestro`: instantáneas mínimas y eventos capturados por triggers en la misma transacción. No contiene archivos, mensajes, documentos de identidad ni domicilios de las partes. No tiene FK al siniestro para sobrevivir a su eliminación definitiva.
- `InformeMensual`: período, control de generación/envío, resultados JSON y clave del PDF. No se guardan JSON ni recursos auxiliares en Cloudflare.
- Historial visible existente: se conserva. No se interpretan descripciones para reconstruir estados o importes.
- Prefijo R2 oficial: `informes mensuales/AAAA/MM/uuid.pdf`. Las descargas requieren sesión y autorización; cada pedido genera una URL firmada de vida corta con Content-Disposition attachment y application/pdf.

## Reglas de indicadores

El período es [inicio del mes a las 00:00 Argentina, inicio del siguiente mes). En pruebas del mes actual se corta al instante de generación.

Administrados son casos que estuvieron abiertos y no dados de baja en algún momento del mes. Nuevos son altas registradas en el período; cerrados son casos que alcanzaron un estado esCierre, una vez por caso y mes (se usa el último cierre para su resultado). Abiertos/en mediación son los pendientes al corte: no se agrega otro estado de mediación. Los indicadores se superponen.

La cartera se atribuye al responsable/aseguradora/ajustador del corte; el cierre, a los del cierre; cada actividad, a su autor. Nuevos asignados por responsable son casos distintos recibidos en el mes. La primera respuesta es la primera novedad desde cada asignación/reasignación, sin contar novedades anteriores. Resolución es ingreso a cierre, con promedio y mediana. Los tiempos de estado se recortan al período y se promedian por permanencia observada.

La demora se calcula al corte con el último movimiento observado: amarillo desde 72 horas y rojo desde 7 días. No se almacena un semáforo en Siniestro. Se incluyen top 5, desglose por aseguradora/ajustador/responsable, pericias por tipo, pendientes >30 días, lesiones, menores, abogados de terceros, resultados, economía por moneda y aseguradora, comparación y tendencia de seis meses, antigüedad, bajas/reactivaciones/reaperturas.

Las lesiones se cuentan por caso y gravedad: un caso puede aparecer en varias categorías. Menores y abogados describen la cartera abierta al corte. La economía incluye solamente cierres con ambos importes disponibles; muestra la cobertura y diferencia, sin presentarla como pago efectivo ni mezclar monedas.

## Limitación histórica explícita

La migración toma una línea base del estado actual y marca el inicio de la cobertura. No inventa las asignaciones, estados, cierres ni novedades faltantes del pasado. Los períodos iniciados antes de esa fecha muestran **cobertura parcial**, incluso en la primera página. No se usan como comparación completa ni se dibujan como ceros los meses sin informes comparables. Los primeros períodos se completan conforme el sistema reúne información real.

## Validación

`npm run test:informes -w backend` y `npm run test:informes:db -w backend`. La segunda crea y elimina una base local temporal, nunca usa la principal para cargar pruebas. R2 y correo se simulan en las pruebas automatizadas: la prueba manual permite verificar tus servicios reales.
