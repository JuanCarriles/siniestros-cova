# Bandeja de notificaciones — E8 / CU-08

Rama `feat/bandeja-notificaciones`. Referencia: Diseño del sistema siniestros - COVA SRT, CU-08 (páginas 29–31 de la copia de escritorio). Se mantienen paleta, tipografía Atkinson y controles accesibles del Layout.

## Comportamiento

- Campana: panel desplegable con las notificaciones sin leer, tipo, fecha/hora completa, descripción, siniestro y revisión. Se muestran hasta 20 por apertura; al mostrarlas se marcan leídas solo esas 20, conservándolas en el panel hasta cerrarlo. No se marcan avisos de páginas que no se mostraron.
- Ver todas abre `/notificaciones`. Al entrar se marcan todas las notificaciones propias visibles como leídas, según CU-08. Si falla el marcado, la lista se muestra igualmente y Actualizar reintenta. Refrescar o filtrar dentro de la pantalla después de un marcado exitoso no sobrescribe un marcado manual posterior como no leído.
- Filtros por tipo y revisión (Todas, Sin revisar, Revisadas), combinables, paginados y reflejados en la URL. Resumen de lectura y revisión separados; estados vacíos y errores con reintento.
- Marcar leída no significa revisar. Se puede volver a sin leer. Revisar marca también leída; quitar revisión conserva la lectura.
- Abrir un aviso espera a que el servidor guarde su revisión y navega a la pestaña correspondiente: chat, novedades, documentos o historial para cambios de estado; los otros tipos abren Datos del caso. Si falla, informa el error y no navega a un destino alternativo.
- El gestor anterior conserva los avisos de reasignación, pero si ya no tiene permiso para ver el caso el aviso lo explica. No se otorga acceso al expediente por recibir una notificación ni se redirige silenciosamente al listado.
- Contador actualizado al realizar acciones, al volver a la pestaña y cada minuto visible, mediante GET /api/notificaciones/resumen (solo sinLeer y sinRevisar). No se duplica el pedido con focus. La campana no marca leídos por estar montada: lo hace la apertura del panel.

## Servidor

La tabla ya tiene tipoNotificacion, leida y revisada; no se agregan columnas, migraciones, dependencias ni cambios en Docker. Cada consulta y marcado consulta el rol vigente y excluye usuarios dados de baja. Solo se listan/marcan notificaciones del destinatario autenticado; no se acepta un idUsuario del navegador. La ficha conserva sus controles de acceso.

- GET `/api/notificaciones/resumen`: conteos privados, sin cargar mensajes.
- GET `/api/notificaciones`: pagina, tipo, lectura (todas/sin-leer/leidas), revision (todas/pendientes/revisadas). Consulta sin efectos secundarios.
- PATCH `/api/notificaciones/:id/lectura`: `{leida:boolean}`; `{}` sigue siendo compatible y marca leída.
- PATCH `/api/notificaciones/:id/revision`: `{revisada:boolean}`.
- PATCH `/api/notificaciones/lecturas`: `{ids:[...]}` (hasta 100) o `{todas:true}`. Nunca afecta otros destinatarios.

Todas las respuestas de la bandeja usan Cache-Control: no-store. El frontend usa contratos compartidos Zod y los componentes Select, Button, Badge, Paginacion, Aviso y el Popover basado en Radix ya instalado.

## Verificación

`npm run test:notificaciones:db -w backend` crea y elimina una base temporal con R2 y correo fuera del flujo. Comprueba filtros combinados, privacidad, marcados independientes, lotes, rol vigente, bajas de usuario y paginación estable. `npm run test:design -w frontend` incluye contratos de filtros y permisos de navegación. Se conservan las pruebas de estado y reasignación.

Prueba manual: abrir la campana con avisos sin leer, comprobar el desplegable y su contador, entrar a Ver todas, combinar tipo y revisión, marcar sin leer/revisar y abrir un aviso. Debe registrar revisión y abrir exactamente su siniestro. Probar con los tres roles y con un aviso de reasignación de un expediente al que el gestor ya no tenga acceso. Revisar también el panel y los filtros en celular y con teclado.

Para ejecutar lo nuevo en Docker después de cambiar de rama: `docker compose up -d --build`. Las pruebas no modifican las notificaciones ni los expedientes de la base del usuario.

## Correcciones de revisión E8-01

- Escrituras con ReadCommitted por defecto; solo listar y resumen solicitan RepeatableRead para conteos coherentes. Los marcados simultáneos esperan las filas en lugar de fallar por conflicto de serialización.
- Un fallo al marcar no impide consultar ni mostrar los avisos. Se distingue del error de consulta y se reintenta la lectura automática pendiente con Actualizar.
- La lista conserva el DOM al refrescar. El foco vuelve al botón usado sin desplazar la página; si el filtro quita la fila, va al aviso siguiente, o al resumen si ya no hay siguiente. Una región de estado anuncia el marcado.
- El panel compacto conserva la tipografía y los colores del Layout, muestra tipo, fecha y mensaje, y deja las acciones de lectura/revisión en Ver todas. Se quitó Actualizar del panel para evitar vaciar los avisos recién mostrados. El nombre accesible del botón incluye todo el mensaje visible.
- Se conserva el filtro de lectura porque el desplegable necesita consultar los no leídos. listar acepta solamente el objeto de consulta; se actualizaron sus pruebas consumidoras.
- Pruebas: 45 marcados masivos HTTP simultáneos en tres rondas, 16 marcados individuales combinados, privacidad del resumen, fallos de marcado con lista disponible, reintento, cancelación y destinos por tipo. Verificación visual adicional del foco en filas que permanecen/desaparecen y del panel en celular.

Las correcciones se implementaron en feat/bandeja-notificaciones (af4f997) y se incorporaron en feat/generar-notificaciones-evento durante su revisión. Las ramas del chat se actualizan después, siguiendo ese orden de integración.
