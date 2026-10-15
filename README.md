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

- El backend arranca recién cuando `migrate` terminó bien: nunca corre contra una base sin migrar.
- `GET /api/health` responde 200 si la API llega a la base y 503 si no; lo usa el healthcheck de Docker.
- La configuración de Nginx está en `frontend/nginx/`. Al arrancar elige el modo: **solo HTTP** si no hay `DOMAIN` o
  todavía no existe el certificado (desarrollo), **HTTPS** si lo hay (VPS). En el VPS publica los puertos 80 y 443.
- Variables: `.env` en la raíz (credenciales de Postgres, ver `.env.example`; opcional en desarrollo) y
  `backend/.env` (obligatorio, copiar de `backend/.env.example`).

## Deploy en un VPS

Guía paso a paso del día a día y de cada actualización: [`docs/flujo-de-trabajo.md`](docs/flujo-de-trabajo.md).

Requisitos: Ubuntu 24.04, 2 GB de RAM o más (con 1 GB, agregar swap: el build de las imágenes usa mucha memoria).

1. Instalar Docker (con el plugin compose) y clonar el repo. Usar la rama `main`.
2. Crear `.env` en la raíz a partir de `.env.example`:
   - contraseña de Postgres **solo de letras y números** (`openssl rand -hex 32`). Tiene que existir **antes** del
     primer `up`: Postgres la usa únicamente al crear la base;
   - `DOMAIN`: el dominio, o sin dominio propio `IP-CON-GUIONES.sslip.io` (p. ej. `203-0-113-10.sslip.io`);
   - `HTTP_PORT=80`, `HTTPS_PORT=443` y `COMPOSE_PROFILES=ssl`.
3. Crear `backend/.env` a partir de `backend/.env.example`: `SESSION_SECRET` largo y aleatorio,
   `APP_URL=http://DOMINIO` y `COOKIE_SECURE=false` (se cambian en el paso 6). `DATABASE_URL` y `NODE_ENV` los pone
   el compose.
4. Firewall (`ufw` y el del panel del proveedor): permitir solo 22, 80 y 443. La base y el backend escuchan solo en
   `127.0.0.1`.
5. `docker compose up -d --build --wait`, verificar `docker compose ps` y `docker compose logs migrate`, y abrir
   `http://DOMINIO/api/health` (`"db":"ok"`). Nginx arranca en modo solo HTTP porque todavía no hay certificado.
6. Obtener el certificado SSL de Let's Encrypt y pasar a HTTPS: `sh scripts/obtener-certificado.sh` (al correrlo se
   acepta el acuerdo de suscriptor de Let's Encrypt). Después, en `backend/.env`: `APP_URL=https://DOMINIO` y
   `COOKIE_SECURE=true`, y aplicarlo con `docker compose up -d --wait backend`.

La renovación es automática: el servicio `certbot` intenta renovar cada 12 h (los certificados duran 90 días y se
renuevan cuando faltan menos de 30) y Nginx recarga cada 6 h para tomar el nuevo. Para comprobar que la renovación va a
funcionar: `docker compose exec certbot certbot renew --dry-run`.

**Cambiar a un dominio propio:** apuntar el DNS (registro `A`) a la IP del VPS, cambiar `DOMAIN` en el `.env`,
`docker compose up -d` (Nginx vuelve a solo HTTP porque no hay certificado para el dominio nuevo) y correr de nuevo
`sh scripts/obtener-certificado.sh`. Actualizar `APP_URL` en `backend/.env`. Paso a paso, con qué se gana y cómo volver
atrás: [`docs/dominio-propio.md`](docs/dominio-propio.md).

**No correr la seed de desarrollo en el VPS** (se niega con `NODE_ENV=production`). Para consultar la base desde tu
máquina, usar un túnel SSH (`ssh -L 5432:127.0.0.1:5432 usuario@IP`) y conectarse a `localhost:5432`.

Pendiente para producción real: dominio propio y backups diarios fuera del VPS (RNF-04).
