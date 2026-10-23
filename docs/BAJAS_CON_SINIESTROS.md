# Bajas de usuarios y ajustadores con siniestros asociados

En Usuarios o Ajustadores, elegir **Dar de baja** consulta los siniestros actuales. Activo significa: sin baja lógica y con un estado cuya bandera `esCierre` es falsa. Un cerrado o dado de baja no bloquea, aunque conserve la asociación histórica.

El modal muestra número, aseguradora y estado de cada caso, en páginas de cinco, con **Ver siniestro** para abrir su ficha. **Actualizar casos** vuelve a consultar y permite comprobar si ya se resolvieron o reasignaron. No se reasignan casos automáticamente ni se da de baja sin confirmar.

Mientras se consulta, si falla la consulta o si queda al menos un activo, no se habilita la confirmación. Al confirmar, el servidor vuelve a evaluar la condición en la escritura: un caso asignado después de abrir el modal también bloquea la baja. Un 409 por casos nuevos actualiza el detalle y el listado.

Las consultas `GET /api/usuarios/:id/siniestros-activos?pagina=1` y `GET /api/ajustadores/:id/siniestros-activos?pagina=1` exigen sesión administrativa y no se almacenan en caché. En usuarios se valida además la jerarquía vigente del actor. Las fichas conservan sus controles de acceso existentes.

No requiere cambios del esquema ni migraciones.

## Comprobación

- `npm run test:usuarios -w backend` y `npm run test:ajustadores -w backend`: permisos y validación HTTP.
- `npm run test:bajas:db -w backend`: ambos tipos, paginación, casos cerrados/eliminados/ajenos excluidos, jerarquías vigentes, baja bloqueada con uno o más activos y permitida al quedar cero. Todos los datos se revierten.
- Manual: abrir el modal de una persona con casos activos; comprobar el detalle, abrir una ficha y volver. Resolver o reasignar los casos desde el módulo correspondiente; volver al modal y usar **Actualizar casos**. La baja solo se completa después de quedar sin activos y confirmarla.
