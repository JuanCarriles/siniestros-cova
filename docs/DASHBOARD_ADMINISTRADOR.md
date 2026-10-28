# Dashboard administrativo

Disponible en `/dashboard` para administrador y superadministrador. El gestor conserva su dashboard personal.

## Contenido

- Totales por estado de todos los siniestros sin baja ni eliminación en curso, incluidos los de cierre.
  Cada tarjeta abre el listado filtrado por ese estado. Se incluyen estados sin casos (cero), y estados
  retirados que todavía tengan casos, para no ocultar cantidades.
- Casos demorados activos: desde 72 horas sin movimientos, amarillo entre 3 y 6 días y rojo desde 7.
  Se reutilizan los límites y el semáforo del listado. Orden por último movimiento o, si no lo hay,
  por fecha de asignación; primero el más antiguo.
- Sin asignar: casos activos cuyo `idUsuario` es `null`, ordenados por la fecha de ingreso del expediente
  (`fechaAsignacion` en el modelo actual), primero el más antiguo. La asignación conserva esa fecha histórica.
- Actividad reciente: historial real, con autor y fecha, ordenado del más reciente al más antiguo.
  Se excluyen eventos dados de baja y siniestros de baja o con eliminación en curso, para enlazar solo fichas disponibles.
- Cinco elementos iniciales por bloque. «Ver todos» abre `/dashboard?ver=demorados|sin-asignar|actividad`,
  con 25 elementos por página y enlace para volver al resumen. Los totales siguen representando toda la base.
- Hora de consulta, actualización manual, estados vacíos y tarjetas adaptadas a celular.

## Asignar gestor

El modal carga únicamente gestores activos. El servidor comprueba sesión y rol, el rol vigente del actor,
que el destinatario siga siendo gestor activo y que el caso siga activo, disponible y sin responsable.
La transacción serializable y los bloqueos evitan sobrescribir una asignación concurrente. Se registra
un evento ASIGNACION con autor y fecha, se crea la notificación del gestor y se actualiza el último movimiento.
Una segunda asignación se rechaza con 409. No reasigna casos que ya tengan responsable.

## API

- `GET /api/dashboard/administrador?ver=actividad&pagina=1`
- `GET /api/dashboard/administrador/gestores`
- `PATCH /api/dashboard/administrador/siniestros/:id/gestor` con `{ "idUsuario": 123 }`

Lecturas sin caché y realizadas en una instantánea RepeatableRead. Filtros, ids y cuerpos validados con Zod.
Sin sesión: 401. Gestores: 403. Conflictos de asignación: 409. Los errores incluyen una explicación visible.

## Base y despliegue

Migración `20261028120000_dashboard_sin_gestor`: hace opcional `Siniestro.idUsuario`; no borra ni reasigna datos.
El listado, la ficha y la reactivación aceptan casos sin gestor. Los gestores no pueden abrir esos casos.
Se conservan los usuarios asignados actualmente. El dashboard no inventa casos sin asignación ni quita responsables.
El alta existente no se amplía en esta historia; las futuras altas pueden dejar el gestor pendiente usando `null`.

Antes de desplegar el backend nuevo:

```sh
npm run prisma:migrate:deploy -w backend
npm run prisma:generate -w backend
```

No se modifican archivos Docker ni variables de entorno. Reconstruir las imágenes para ver cambios en Docker.

## Verificación

```sh
npm run test:dashboard -w backend
npm run test:dashboard:admin:db -w backend
npm run test:dashboard:db -w backend
npm run test:design -w frontend
npm run typecheck --workspaces --if-present
npm run lint --workspaces --if-present
npm run build
```

La prueba administrativa crea una base local `cova_test_dashboard_*`, aplica las migraciones, prueba el flujo
y la elimina en `finally`. Requiere PostgreSQL local y permiso CREATEDB. No resetea la base del proyecto.
Comprueba conteos, límites, orden, estados vacíos, permisos, asignación e historial, y compatibilidad de listado/ficha.

Manualmente: entrar como administrador, contrastar tarjetas con sus listados, abrir casos desde los tres bloques,
usar Ver todos y Actualizar, asignar un gestor a un caso pendiente y verificar que desaparece de Sin asignar y
aparece en el dashboard del destinatario. Si no hay casos sin gestor, se muestra el estado vacío sin crear datos ficticios.
