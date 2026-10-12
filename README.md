# Sistema de Gestión de Siniestros — Estudio Cova SRT

Aplicación web responsiva para gestionar siniestros: aseguradoras, ajustadores, usuarios, la ficha del caso
(vehículos, personas, abogados, peritos), novedades, documentos, chat interno, notificaciones e informes mensuales.

El diseño completo (requerimientos, casos de uso, pila y despliegue) está en [`docs/`](docs/).

## Estructura

```
backend/    API REST + Socket.IO — Node, Express, TypeScript, Prisma (PostgreSQL), Zod
frontend/   SPA — React, Vite, TypeScript, React Router, React Hook Form, Tailwind
docs/       Documento de diseño y referencia visual (HTML de la ficha del siniestro)
```

### Backend

Organizado por módulo de negocio en `src/modules/`. Cada módulo sigue el mismo patrón:

```
<modulo>.routes.ts      endpoints + roles permitidos
<modulo>.controller.ts  req/res, sin lógica
<modulo>.service.ts     reglas de negocio + Prisma
<modulo>.schemas.ts     validaciones Zod
```

- `middlewares/` autenticación por cookie httpOnly, control de roles, validación, uploads, errores
- `sockets/` Socket.IO (chat en tiempo real)
- `jobs/` node-cron: siniestros demorados (72 h) e informe mensual en PDF (pdfkit)
- `lib/` integraciones: Cloudflare R2, Resend, generación de PDF, hash de contraseñas (argon2)

### Frontend

Organizado por funcionalidad en `src/features/`, espejo de los módulos del backend. Cada feature tiene
`api/`, `components/`, `hooks/`, `schemas/` (Zod) y `pages/`. Los componentes reutilizables viven en
`src/components/ui` y el tema de Tailwind en `src/styles/index.css`.

## Desarrollo

1. Copiar `backend/.env.example` → `backend/.env` y `frontend/.env.example` → `frontend/.env`.
2. Frontend:
   ```bash
   cd frontend
   npm install
   npm run dev      # http://localhost:5173 — /api y /socket.io se redirigen a localhost:3000
   npm run build    # chequeo de tipos + build de producción en dist/
   npm run lint     # oxlint
   ```
3. _(pendiente: backend, Dockerfiles y docker-compose)_
