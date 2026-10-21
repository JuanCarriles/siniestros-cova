# Sistema de Gestión de Siniestros — Estudio Cova SRT

Aplicación web responsiva para gestionar siniestros: aseguradoras, ajustadores, usuarios, la ficha del caso
(vehículos, personas, abogados, peritos), novedades, documentos, chat interno, notificaciones e informes mensuales.

El diseño completo (requerimientos, casos de uso, pila y despliegue) está en [`docs/`](docs/).

**Cómo trabajamos** (programar un módulo, migraciones y deploy a producción):
[`docs/flujo-de-trabajo.md`](docs/flujo-de-trabajo.md).

## Estructura

Monorepo con [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces): una sola instalación desde la raíz
y un solo `package-lock.json`.

```
shared/     @cova/shared — esquemas Zod y tipos que usan backend y frontend
backend/    API REST + Socket.IO — Node, Express, TypeScript, Prisma (PostgreSQL)
frontend/   SPA — React, Vite, TypeScript, React Router, React Hook Form, Tailwind
docs/       Documento de diseño y referencia visual (HTML de la ficha del siniestro)
```

### Shared

Las validaciones se escriben **una sola vez** en `shared/src/schemas/<modulo>.ts` y las usan los dos lados:
el backend para validar el body de cada request y el frontend para los formularios (React Hook Form + zodResolver).
Cada archivo exporta el esquema y su tipo inferido:

```ts
import { aseguradoraSchema, type AseguradoraInput } from '@cova/shared'
```

El paquete se publica como TypeScript sin compilar: Vite y tsx lo leen directo, y el build del backend
(tsdown) lo incluye dentro del bundle. Por eso solo admite sintaxis "borrable" (sin `enum` ni `namespace`).
Si el frontend necesita un campo que solo existe en el formulario (por ejemplo "repetir contraseña"),
extiende el esquema compartido en la feature en lugar de copiarlo.

### Backend

Organizado por módulo de negocio en `src/modules/`. Cada módulo sigue el mismo patrón:

```
<modulo>.routes.ts      endpoints + roles permitidos
<modulo>.controller.ts  req/res, sin lógica (valida con los esquemas de @cova/shared)
<modulo>.service.ts     reglas de negocio + Prisma
```

- `middlewares/` autenticación por cookie httpOnly, control de roles, validación, uploads, errores
- `sockets/` Socket.IO (chat en tiempo real)
- `jobs/` node-cron: siniestros demorados (72 h) e informe mensual en PDF (pdfkit)
- `lib/` integraciones: Cloudflare R2, Resend, generación de PDF, hash de contraseñas (argon2)

### Frontend

Organizado por funcionalidad en `src/features/`, espejo de los módulos del backend. Cada feature tiene
`api/`, `components/`, `hooks/` y `pages/`. Los componentes reutilizables viven en `src/components/ui`
y el tema de Tailwind en `src/styles/index.css`.

## Desarrollo

Requiere Node 22 (ver `.nvmrc`).

1. Copiar `backend/.env.example` → `backend/.env` y `frontend/.env.example` → `frontend/.env`.
2. Instalar todo desde la raíz (nunca dentro de `backend/` o `frontend/`):
   ```bash
   npm install
   ```
3. Levantar cada parte en su terminal:
   ```bash
   npm run dev:back    # http://localhost:3000 — recarga al guardar (tsx watch)
   npm run dev:front   # http://localhost:5173 — /api y /socket.io se redirigen a localhost:3000
   ```
4. Chequeos (corren en los tres workspaces):
   ```bash
   npm run typecheck
   npm run lint          # ESLint (npm run lint:fix corrige lo automático)
   npm run format:check  # Prettier (npm run format aplica el formato)
   npm run build
   ```

### Lint y formato

- **ESLint** (`eslint.config.mjs`, uno solo para todo el monorepo): reglas recomendadas de JS y TypeScript
  con información de tipos (detecta promesas sin `await`, uso de `any`, etc.), reglas de hooks de React en el
  frontend y globals de Node en el backend. Parámetros que no se usan pero son obligatorios se nombran con `_`.
- **Prettier** (`.prettierrc.json`): sin punto y coma, comillas simples, 100 columnas. Ordena las clases de
  Tailwind con `prettier-plugin-tailwindcss`. ESLint no opina de formato (`eslint-config-prettier`).
- El cliente de Prisma (`backend/src/generated/`) se ignora en ambos. Para que ESLint analice con tipos lo que
  usa Prisma, el cliente tiene que estar generado (`npm run prisma:generate -w backend`).
- En VS Code, `.vscode/extensions.json` recomienda las extensiones de ESLint, Prettier, Tailwind y Prisma.

Para agregar una dependencia a un solo workspace: `npm install <paquete> -w backend` (o `-w frontend`, `-w shared`).

Endpoint de prueba del backend: `GET /api/health`.

## Docker

Las dos imágenes se construyen con la **raíz del repo como contexto** (necesitan el `package-lock.json` del
monorepo y `shared/`), por eso hay un único `.dockerignore` en la raíz.

```bash
docker compose up -d --build --wait   # db → migrate → backend → frontend
docker compose ps
docker compose logs -f backend
docker compose logs migrate           # resultado de las migraciones y de la seed de catálogos
docker compose down                   # detiene (los datos de Postgres quedan en el volumen db_data)
```

| Servicio | Acceso                | Notas                                                                                     |
| -------- | --------------------- | ----------------------------------------------------------------------------------------- |
| frontend | http://localhost:8080 | Nginx: sirve el build de Vite y hace proxy de `/api` y `/socket.io` al backend            |
| backend  | http://127.0.0.1:3000 | Solo local; el tráfico real entra por Nginx                                               |
| db       | 127.0.0.1:5432        | Solo local, para correr Prisma desde la máquina                                           |
| migrate  | —                     | Tarea de un solo uso en cada `up`: `prisma migrate deploy` + seed de catálogos, y termina |
| certbot  | —                     | Solo en el VPS (perfil `ssl`): renueva el certificado SSL automáticamente                 |
| backup   | —                     | Solo en el VPS (perfil `backup`): backup diario de la base y los documentos a R2          |

- El backend arranca recién cuando `migrate` terminó bien: nunca corre contra una base sin migrar.
- `GET /api/health` responde 200 si la API llega a la base y 503 si no; lo usa el healthcheck de Docker.
- La configuración de Nginx está en `frontend/nginx/`. Al arrancar elige el modo: **solo HTTP** si no hay `DOMAIN` o
  todavía no existe el certificado (desarrollo), **HTTPS** si lo hay (VPS). En el VPS publica los puertos 80 y 443.
- Variables: `.env` en la raíz (credenciales de Postgres, ver `.env.example`; opcional en desarrollo) y
  `backend/.env` (obligatorio, copiar de `backend/.env.example`).

## Deploy en un VPS

Todo el proceso, paso a paso, está en **[`DEPLOY.md`](DEPLOY.md)**: preparar el VPS, Cloudflare R2, primer deploy,
HTTPS, backups, actualizaciones, cómo restaurar y cómo recuperar el sistema si se pierde el servidor. El día a día de
desarrollo y cómo llega un cambio a producción: [`docs/flujo-de-trabajo.md`](docs/flujo-de-trabajo.md).

En resumen, en el VPS corren los mismos servicios que en tu PC más dos que solo se activan ahí con
`COMPOSE_PROFILES=ssl,backup` en el `.env` de la raíz:

- `certbot`: certificado SSL de Let's Encrypt con renovación automática. Sin dominio propio se usa sslip.io; para pasar
  a un dominio propio: [`docs/dominio-propio.md`](docs/dominio-propio.md).
- `backup`: todos los días a las 3:00, dump cifrado de la base y copia de los documentos en Cloudflare R2, con 30 días
  de retención (RNF-04). Restauración probada con `sh scripts/probar-backups.sh` (RNF-05).

| Script                                             | Qué hace                                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `sh scripts/obtener-certificado.sh`                | Primer certificado SSL y paso a HTTPS                                                  |
| `sh scripts/backup-ahora.sh`                       | Backup en el momento. Usarlo antes de cada deploy                                      |
| `sh scripts/probar-backups.sh`                     | Verificación completa sin modificar datos: backup, restauración de prueba y documentos |
| `sh scripts/probar-restauracion.sh`                | Restaura el último backup en una base temporal, la compara y la borra                  |
| `sh scripts/restaurar-backup.sh --listar`          | Backups disponibles, historial de documentos y bases guardadas                         |
| `sh scripts/restaurar-backup.sh NOMBRE`            | Reemplaza la base por un backup. La actual queda guardada                              |
| `sh scripts/restaurar-backup.sh --volver-a BASE`   | Vuelve a una base guardada (deshace una restauración)                                  |
| `sh scripts/restaurar-documentos.sh ORIGEN [RUTA]` | Devuelve documentos que falten en la app, sin sobrescribir ni borrar                   |

**No correr la seed de desarrollo en el VPS** (se niega con `NODE_ENV=production`). Para consultar la base desde tu
máquina, usar un túnel SSH (`ssh -L 5432:127.0.0.1:5432 usuario@IP`) y conectarse a `localhost:5432`.

Pendiente para producción real: dominio propio y bucket de documentos de producción.
