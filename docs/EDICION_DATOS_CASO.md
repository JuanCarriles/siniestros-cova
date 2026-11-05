# Edición de datos del caso por rol (CU-10 2.a, 4.a y 5.a)

En Datos del caso, **Modificar datos** habilita los cuatro bloques del mockup. Administración edita póliza,
ajustador, hecho y lugar. El gestor solo edita hecho y lugar de sus casos asignados. El servidor vuelve a consultar
el rol vigente y rechaza campos protegidos, aunque el cliente los envíe. Los casos cerrados, de baja o con
eliminación pendiente no se editan. El usuario asignado es de consulta: solo **Reasignar** (E5-03) lo cambia.

## Cambios simultáneos sin perder el formulario

`GET /api/siniestros/:id/edicion` entrega datos, catálogos y `revision` (entero desde cero).
`PATCH /api/siniestros/:id/datos` recibe esa revisión junto con los campos permitidos para el rol.
Con el siniestro bloqueado, compara contra los datos actuales: si ya coinciden devuelve `{ modificado: false }`,
sin agregar historial ni aumentar la revisión. Si difieren, `exigirRevision()` comprueba que no se haya guardado
una edición posterior. Una edición real incrementa `Siniestro.revision` y registra `MODIFICACION_DATOS`, con
antes/después, autor de la sesión y fecha del servidor, en la misma transacción.

Si otro usuario editó el caso, responde 409 con `{ codigo: 'REGISTRO_DESACTUALIZADO', revision }`.
El frontend reutiliza `useRevision()`: conserva todo lo escrito y actualiza la ficha detrás. El aviso explica
que guardar otra vez reemplaza los cambios, mientras que cancelar permite consultar la versión actual.
Si hay otra modificación antes del segundo guardado, vuelve a pedir revisión; no se fuerza la escritura.

Cambiar el nombre de la aseguradora/ajustador, el email del responsable, cargar una novedad, cambiar el estado
o reasignar no incrementa esta revisión. Al guardar se vuelve a comprobar acceso, cierre y catálogos.
Editar estos datos no reinicia `fechaUltimoMovimiento` ni cambia `demorado` o `fechaAsignacion`.

## Validación y direcciones

El formulario usa `zodResolver` con los schemas compartidos por rol. Los errores se señalan en su campo;
país solo filtra provincias y no se envía. Los datos de póliza protegidos no bloquean la edición del gestor.
El número es único por aseguradora, sin distinguir mayúsculas e incluyendo los casos dados de baja.
P2002 se convierte en el mismo mensaje de duplicado. Los catálogos retirados ya guardados se conservan;
las nuevas referencias deben seguir activas. Las direcciones compartidas se copian antes de editar usando
`usosDeDireccion()`, como en usuarios, perfil y personas. Si falla historial se revierte todo, incluida la revisión.
El aviso de éxito permanece hasta la próxima acción y los errores conservan lo escrito.

## Integración y migración

La rama incorpora el `desarrollo` con E5-03, E5-04 corregida y las notificaciones compartidas. E5-02 no envía
notificaciones ni correos ni duplica la reasignación. Docker y las credenciales no se modifican.

La migración nueva `20261105120000_revision_datos_caso` agrega `Siniestro.revision INTEGER NOT NULL DEFAULT 0`
después de las migraciones ya publicadas. Conserva los registros. La migración antigua
`20261102160000_historial_modificacion_datos` no se renombra: ya fue integrada y aplicada, y cambiar su nombre
rompería el registro de migraciones de esas bases. Aplicar pendientes con:

```sh
npm run prisma:migrate:deploy -w backend
npm run prisma:generate -w backend
```

En Docker Compose, el servicio `migrate` aplica las pendientes antes de iniciar el backend.

## Verificación

```sh
npm run test:siniestros:edicion -w backend
npm run test:siniestros:edicion:db -w backend
npm run test:migraciones:db -w backend
npm run test:design -w frontend
npm run lint
npm run build
```

Las pruebas de base usan bases temporales, aplican migraciones allí y las eliminan al terminar.
Prueba manual: abrí el mismo caso en dos sesiones y empezá a editar. Guardá en una; al guardar en la otra debe
aparecer el aviso sin perder valores. Revisá y guardá nuevamente o cancelá. Comprobá el historial y que los días
sin movimiento no se reinicien. Probá también como gestor, con número duplicado y con un caso cerrado.
