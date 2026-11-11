# Notificaciones compartidas

Rama `feat/notificaciones-compartidas`, basada en desarrollo. Dependencia común de edición de datos, reasignación y cambio de estado: no implementa ninguna de esas operaciones.

Incluye GET /api/notificaciones y PATCH /api/notificaciones/:id/lectura, contratos compartidos y campana en el Layout. Solo se consultan y marcan los avisos del usuario de la sesión. El gestor anterior conserva su aviso de reasignación, con una explicación cuando ya no tiene acceso al expediente; abrir la ficha sigue requiriendo ser el responsable actual.

Las pantallas llaman `actualizarNotificaciones()`; la bandeja encapsula su suscripción y se actualiza además al abrir, volver a la pestaña y cada minuto visible. Usa las tablas existentes, sin migraciones ni credenciales nuevas.

Integrar esta rama antes de las historias que usan avisos. No publicar copias alternativas de la misma bandeja desde cada historia.

La evolución E8 / CU-08 agrega revisión independiente, filtros, desplegable de no leídas y pantalla completa. Ver [BANDEJA_NOTIFICACIONES.md](BANDEJA_NOTIFICACIONES.md). Los avisos sin permiso de expediente explican la restricción; ya no se redirigen al listado.
