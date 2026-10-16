# Paneles de navegación por rol

## Probar

Desde la raíz, ejecutar `npm run dev:front` y abrir `http://localhost:5173/vista-previa` (o el puerto que indique Vite).

- `/vista-previa/administrador/dashboard`
- `/vista-previa/super-administrador/dashboard`
- `/vista-previa/gestor/siniestros`
- `/vista-previa/gestor/plantillas`

Administrador y superadministrador comparten estructura. El perfil distingue el rol. No se inventan diferencias de permisos operativos: deberán definirse con cada módulo.

| Rol                                | Menú principal                                                       | Acceso inferior |
| ---------------------------------- | -------------------------------------------------------------------- | --------------- |
| Gestor                             | Siniestros, Plantillas                                               | Mi perfil       |
| Administrador y superadministrador | Dashboard, Siniestros, Aseguradoras, Ajustadores, Usuarios, Informes | Mi perfil       |

El HTML recibido se usó solamente como referencia estructural. Se reutilizan la tipografía Atkinson, los colores semánticos y Button, Badge y Dialog del sistema actual. El panel lateral tiene una opción activa con texto destacado, fondo y borde de acento; el significado no depende únicamente del color. Los controles conservan el tamaño accesible del proyecto.

## Integración de los módulos

- `src/components/layout/panel-layout.tsx`: estructura común, navegación de escritorio, menú móvil y `Outlet` para el contenido. Recibe `usuario: { nombre, tipo }` y `basePath` desde el contexto de sesión de la aplicación.
- `src/components/layout/panel-navigation.ts`: catálogo de secciones y lista explícita por rol. Reutiliza `TipoUsuario` derivado de Zod en `@cova/shared`.
- `src/components/layout/panel-context.ts`: `usePanel()` permite leer el usuario y la ruta base desde un módulo hijo.
- `src/pages/panel-section.tsx`: control de sección y contenido de presentación. Sustituir cada espacio por su módulo manteniendo el control `canOpenSection` antes de renderizarlo. Las rutas de detalle deberán declararse y autorizarse explícitamente; actualmente se rechazan rutas anidadas desconocidas.
- `src/pages/panel-preview.tsx`, `panel-preview-data.ts` y `src/app/panel-preview-routes.tsx`: selector, usuarios y rutas de ejemplo. Se importa exclusivamente en desarrollo; no incluye sesiones reales, persistencia de rol ni llamadas a la base.

Los enlaces no cambian el rol. Una dirección administrativa ingresada dentro de la vista de gestor muestra «Esta sección no está disponible». Cambiar entre perfiles desde `/vista-previa` es una herramienta de desarrollo, no un mecanismo de autorización.

Cuando exista autenticación, montar `PanelLayout` detrás de la sesión real y obtener el rol del servidor. **Ocultar enlaces o bloquear rutas de React no protege una API**: el backend debe validar sesión, rol y acceso al registro. El gestor debe ver sólo sus siniestros asignados y consultar/descargar plantillas; las operaciones de subida, edición y eliminación requieren reglas de servidor. Esta entrega crea las bases de interfaz, no implementa esos endpoints ni reemplaza sus controles.

## Responsive y accesibilidad

En escritorio (desde 64rem) el menú queda visible y el perfil se mantiene abajo. Si falta altura, la lista de navegación tiene su propio scroll. En anchos menores aparece un botón «Abrir menú de navegación», que usa el Dialog existente con foco contenido, Escape y cierre al navegar. Al cambiar a escritorio se cierra el menú móvil. El contenido utiliza anchos flexibles y puede envolver textos; no se bloquea el zoom.

## Comprobación

```powershell
npm run build -w frontend
npm run lint -w frontend
npm run test:design -w frontend
```

Las pruebas de navegación validan las listas de secciones, el rechazo de roles/rutas desconocidos y las restricciones del gestor. Las pruebas de diseño existentes siguen comprobando tokens y contraste.
