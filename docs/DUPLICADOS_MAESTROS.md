# Aseguradoras y ajustadores duplicados

La base no tenía restricciones únicas para el nombre de aseguradora y el email de ajustador. El chequeo
previo del ABM no protegía escrituras simultáneas ni cargas directas de datos de prueba.

La migración `20261105130000_maestros_unicos` unifica duplicados equivalentes conservando el menor id.
Reenlaza siniestros, vehículos y ajustadores al registro conservado. No elimina expedientes ni documentos,
ni altera su historial, fecha de movimiento o demora. Incluye registros activos y dados de baja.

Si una aseguradora repetida tiene estados incompatibles, un email repetido tiene datos personales/contacto
o aseguradoras distintos, o la unificación repetiría números de siniestro, la migración aborta antes de escribir.
Toda la operación y los índices se confirman en una sola transacción, bloqueando escrituras simultáneas.

Se agregan índices únicos por `lower(btrim(nombre))` y `lower(btrim(email))`. Prisma no representa estos
índices de expresión en el esquema; viven en la migración. El backend traduce P2002 a un mensaje 409 claro.
No se ocultan filas mediante filtros ni se unifican personas solamente porque tengan el mismo nombre.

Aplicar con `npm run prisma:migrate:deploy -w backend`; en Docker lo hace el servicio migrate.
Antes de aplicarla sobre una base con datos, conservar un respaldo. No requiere cambios en Docker.
