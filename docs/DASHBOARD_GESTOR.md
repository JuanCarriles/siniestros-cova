# Dashboard del gestor

Al iniciar sesión como gestor se abre `/dashboard`. El menú también ofrece Dashboard, Siniestros,
Plantillas y Mi perfil. Los administradores conservan su inicio con accesos a las secciones.

## Reglas

- Solo se consultan siniestros asignados al usuario autenticado. El cliente no puede elegir otro gestor.
- Activos: sin baja lógica, sin eliminación en curso y con estado que no sea de cierre.
- Demorados: 72 horas o más desde el último movimiento; si nunca hubo uno, desde la asignación.
  Se usa `DIAS_DEMORADO` compartido con el listado y el perfil. No se confía en el flag `demorado` guardado.
- Al día: casos activos menos demorados. Los tres indicadores se consultan en la misma instantánea.
- Pericias pendientes: registros de peritos no eliminados y no cerrados de esos mismos casos activos.
  Cada solicitud cuenta como una pericia, aunque un caso tenga varias. Primero aparecen las más antiguas,
  con cinco por página y acceso a la ficha del siniestro.
- La información se obtiene al entrar, cambiar página o pulsar Actualizar; no hay sondeo automático.

## API

`GET /api/dashboard/gestor?paginaPericias=1`, con sesión de gestor. Sin sesión responde 401;
otros roles, 403. Los parámetros desconocidos y páginas inválidas responden 400.
Los resultados no se almacenan en caché. No requiere migraciones ni cambios en Docker.

## Verificación

Desde la raíz del proyecto:

```sh
npm run test:dashboard -w backend
npm run test:dashboard:db -w backend
npm run test:design -w frontend
npm run typecheck --workspaces --if-present
```

La prueba de PostgreSQL necesita `DATABASE_URL` y los estados base ya migrados. Sus datos se crean
en una transacción que se revierte al terminar. No ejecutar seeds ni reiniciar la base para esta prueba.

Para revisar manualmente, iniciar frontend y backend como siempre, entrar con un gestor y abrir
Dashboard. Comparar con su listado de siniestros activos; otro gestor debe tener sus propios conteos.
Abrir una pericia debe llevar a un caso asignado. Verificar también un gestor sin casos, la paginación,
el botón Actualizar y la vista a 390 px de ancho. En Docker hay que reconstruir frontend y backend
para ver el código nuevo; no se modificó su configuración.


## Integración con desarrollo y accesibilidad

La rama incorpora la ficha E5-01 y conserva ambos exports compartidos (ficha y dashboard).
«Casos activos» abre el listado de activos y «Demorados» lo ordena por demora; este último enlace
prioriza los demorados, no oculta los demás activos. «Al día» mantiene su contador sin un filtro inexistente.
El badge de pericias incluye texto oculto accesible junto al número. Las fechas reutilizan `fechaDe`
y `fechaHoraDe` de la ficha, con año de cuatro cifras y hora en formato de 24 horas.
