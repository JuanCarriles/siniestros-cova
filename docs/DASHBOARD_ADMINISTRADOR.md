# Dashboard administrativo (E9-01)

Disponible en `/dashboard` para administrador y superadministrador. El gestor conserva su dashboard personal.
Reemplaza el inicio anterior de accesos a las secciones; esos accesos continúan en el menú lateral.

## Alcance corregido

- Totales por estado, incluidos los de cierre, sin siniestros de baja ni con eliminación en curso.
  Cada tarjeta abre el listado filtrado por estado. Incluye estados sin casos y estados retirados con casos.
- Casos activos demorados, ordenados por el último movimiento o por la asignación si nunca hubo uno.
  El semáforo reutiliza `DiasSinMovimiento`: amarillo desde 72 horas y rojo desde siete días, con iconos y texto.
- Actividad reciente real, con autor, fecha y enlace a cada ficha E5-01. No incluye eventos o casos de baja,
  ni casos con eliminación en curso, para enlazar fichas disponibles.
- Cinco elementos en cada bloque; «Ver todos» ofrece páginas de 25 resultados.
- Actualización manual, fecha de consulta, estados vacíos y vista adaptable a celular.
- Título visible con `SectionHeading`, márgenes comunes del panel y fechas compartidas con la ficha.

## Asignación y modelo

Se elimina el bloque «Casos sin asignar» y sus endpoints, modal, contratos y migración de usuario opcional.
El alta CU-09 exige un usuario: `Siniestro.idUsuario` y la relación `usuario` siguen siendo obligatorios,
igual que `FichaSiniestro.asignado`. No se crea una asignación alternativa desde este dashboard.
Cambiar el responsable corresponde a la historia de reasignación CU-10, con sus permisos y notificaciones.
La tarjeta E9-01 debe ajustarse para reflejar que todos los siniestros nacen asignados.

## API

`GET /api/dashboard/administrador?ver=demorados|actividad&pagina=1`

Solo administrador y superadministrador; sin sesión responde 401 y al gestor, 403. Parámetros validados
con Zod; no se aceptan filtros «sin-asignar» ni ids enviados para acceder a otros usuarios.
Lecturas sin caché y en una misma instantánea RepeatableRead. No hay operaciones de escritura en el dashboard.

## Verificación

```sh
npm run test:dashboard -w backend
npm run test:dashboard:admin:db -w backend
npm run test:dashboard:db -w backend
npm run test:siniestros:db -w backend
npm run test:migraciones:db -w backend
npm run test:design -w frontend
npm run typecheck --workspaces --if-present
npm run lint --workspaces --if-present
npm run build
```

La prueba administrativa crea una base local `cova_test_dashboard_*`, aplica las migraciones, verifica
conteos, límites, orden, paginación, permisos y fichas con responsable obligatorio y la elimina en `finally`.
No resetea la base del proyecto. No se modifican Docker ni credenciales.
