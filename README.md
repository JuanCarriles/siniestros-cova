# Sistema de Gestión de Siniestros — Estudio Cova SRT

Aplicación web responsiva para gestionar siniestros: aseguradoras, ajustadores, usuarios, la ficha del caso
(vehículos, personas, abogados, peritos), novedades, documentos, chat interno, notificaciones e informes mensuales.

El diseño completo (requerimientos, casos de uso, pila y despliegue) está en [`docs/`](docs/).

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
   npm run lint
   npm run build
   ```

Para agregar una dependencia a un solo workspace: `npm install <paquete> -w backend` (o `-w frontend`, `-w shared`).

Endpoint de prueba del backend: `GET /api/health`.

## Docker

Las dos imágenes se construyen con la **raíz del repo como contexto** (necesitan el `package-lock.json` del
monorepo y `shared/`), por eso hay un único `.dockerignore` en la raíz.

```bash
docker compose up -d --build --wait   # db + backend + frontend
docker compose ps
docker compose logs -f backend
docker compose down                   # detiene (los datos de Postgres quedan en el volumen db_data)
```

| Servicio | Acceso | Notas |
|---|---|---|
| frontend | http://localhost:8080 | Nginx: sirve el build de Vite y hace proxy de `/api` y `/socket.io` al backend |
| backend | http://127.0.0.1:3000 | Solo local; el tráfico real entra por Nginx |
| db | 127.0.0.1:5432 | Solo local, para correr Prisma desde la máquina |

La configuración de Nginx está en `frontend/nginx/`. Requiere `backend/.env` (copiar de `backend/.env.example`).
