# Panel y navegación por rol

Al iniciar sesión cada rol entra a su página: el **gestor** a Siniestros y el **administrador** y el
**superadministrador** al Dashboard (`initialSection` en `panel-navigation.ts`).

| Rol                                | Menú principal                                                                   | Abajo                    |
| ---------------------------------- | -------------------------------------------------------------------------------- | ------------------------ |
| Gestor                             | Siniestros, Plantillas (solo descarga, CU-06)                                    | Mi perfil, Cerrar sesión |
| Administrador y superadministrador | Dashboard, Siniestros, Aseguradoras, Ajustadores, Usuarios, Plantillas, Informes | Mi perfil, Cerrar sesión |

Para probarlo, entrar con los usuarios de prueba del seed de desarrollo (`backend/prisma/seeds/desarrollo.ts`),
uno por rol.

## Piezas

- `src/components/layout/panel-layout.tsx`: estructura común. Menú lateral en escritorio (desde 64rem), menú
  desplegable en celular (Dialog con foco contenido, Escape y cierre al navegar), "Saltar al contenido", foco al
  contenido al cambiar de sección y botón "Cerrar sesión" (action `/salir`).
- `src/components/layout/panel-navigation.ts`: secciones y lista explícita por rol. No se deducen permisos por
  jerarquía.
- `src/components/layout/panel-context.ts`: `usePanel()` da el usuario y la ruta base a las páginas.
- `src/components/layout/section-heading.tsx`: título y descripción de cada sección.
- `src/components/layout/seccion-pendiente.tsx`: contenido provisorio de las secciones que todavía no tienen
  página. Cada historia lo reemplaza en `src/app/router.tsx` por la página de su feature
  (`src/features/<modulo>/pages`).
- `src/components/layout/seccion-no-disponible.tsx`: dirección inexistente o sección que el rol no puede abrir.
- `src/app/panel.tsx`: monta el panel con el usuario de la sesión (loader `cargarPanel`).

## Protección

Cada sección declara su ruta en `src/app/router.tsx` y su loader (`requerirSeccion` en
`src/features/auth/sesion.ts`) controla sesión y rol **antes** de mostrarla. Sin sesión, lleva al login y, al
ingresar, vuelve a la página pedida.

**Ocultar enlaces o bloquear rutas de React no protege los datos**: cada endpoint del backend valida sesión y rol
con `requerirSesion` y `requerirRol` (`backend/src/modules/auth/auth.module.ts`), y el acceso a cada registro (el
gestor ve solo sus siniestros).

## Comprobación

```powershell
npm run build -w frontend
npm run lint
npm run test:design -w frontend
```

Las pruebas de navegación validan las listas de secciones por rol y el rechazo de roles y rutas desconocidos.
