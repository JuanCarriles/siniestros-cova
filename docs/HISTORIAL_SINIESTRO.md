# Historial del siniestro (E5-09, CU-10 1.i)

La pestaña **Historial** de la ficha muestra todo lo que pasó en el siniestro, del más nuevo al más viejo: tipo de evento, descripción, quién lo hizo (nombre y rol) y fecha y hora. Es de solo lectura: los eventos los registra el sistema y no hay ninguna forma de modificarlos o borrarlos desde la aplicación. Solo se van con la eliminación definitiva del siniestro.

## Qué se registra

- **Alta del siniestro**: el primer evento, con cada vehículo, titular, ocupante, persona fuera de los vehículos, abogado y perito cargados en el alta, los documentos y la asignación. Todos con la misma hora.
- **Desde la ficha**: altas, cambios y bajas de vehículos, personas, abogados y peritos; cierre de pericias; novedades; cambios de estado; modificación de datos del caso; reasignación; baja y reactivación del siniestro.

## Autor de cada evento

Cada evento guarda el nombre y el rol de quien lo hizo **tal como eran en ese momento** (columnas `autorNombre` y `autorTipoUsuario`, que completa la base al registrar el evento). Si después el usuario cambia su perfil o su rol, el historial sigue mostrando cómo se identificaba entonces. `idUsuario` sigue apuntando al usuario.

Los eventos registrados antes de esta historia se completaron con los datos que el usuario tenía al migrar: antes no se guardaban.

## Siniestros cargados antes de esta historia

Su historial es **parcial**:

- No tienen el evento de alta. No se reconstruye: la primera asignación no prueba ni la fecha ni el autor de la creación.
- No tienen las altas de vehículos, personas, abogados y peritos que se cargaron en el alta del siniestro.

La pestaña lo avisa en cada siniestro que no tiene su alta registrada.

## Filtro

Los botones de arriba filtran por tipo (alta y asignación, estado y bajas, datos del caso, partes, documentos, novedades, chat), con la cantidad de cada uno. El filtro queda en la dirección (`?tipo=partes`); si el tipo pedido no tiene eventos, se mantiene elegido y se ofrece ver todos.

## Pendiente

El historial se pide completo y se filtra en el navegador. Si los expedientes llegan a tener muchos cientos de eventos, conviene paginarlo ("Cargar más") y filtrar en el servidor.
