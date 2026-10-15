# Flujo de trabajo: desarrollo → producción

Cómo trabajamos día a día al programar un módulo nuevo y cómo llevarlo al servidor sin perder datos.

## Resumen

```
feat/mi-modulo ──PR──► desarrollo ──PR (cuando está estable)──► main ──► deploy en el VPS
   (tu PC)                                                       (lo que corre en producción)
```

- **`main` es producción.** No se commitea directo en `main`; todo entra por Pull Request desde `desarrollo`.
- **`desarrollo`** es la rama de integración: ahí se juntan los módulos terminados.
- Cada módulo o cambio va en su propia rama `feat/...` creada desde `desarrollo`.

---

## 1. Entornos

| Entorno              | Para qué                         | Cómo se levanta                             | Dónde se ve             |
| -------------------- | -------------------------------- | ------------------------------------------- | ----------------------- |
| **Desarrollo**       | Programar (lo de todos los días) | Base en Docker + backend y frontend con npm | `http://localhost:5173` |
| **Prueba tipo prod** | Verificar antes de un PR         | Todo en Docker con `--build`                | `http://localhost:8080` |
| **Producción (VPS)** | Lo que usan los usuarios         | Todo en Docker, rama `main`                 | `https://DOMINIO`       |

> **Importante:** `docker compose up` con todos los servicios levanta la **versión de producción** (código compilado y
> servido por Nginx), **sin recarga automática**. Para programar se usa la base en Docker y el backend/frontend con npm.

Cada máquina tiene **su propia base de datos** (su propio volumen). Los datos nunca viajan entre entornos; lo que viaja
por Git es la **estructura** (las migraciones).

En una misma máquina trabajá con **un solo clon** del repo: el compose tiene un nombre de proyecto fijo
(`siniestros-cova`), así que dos clones en la misma PC comparten contenedores y base.

---

## 2. Día a día: programar un módulo nuevo

Ejemplo: módulo de aseguradoras.

### 2.1 Crear la rama

```bash
git switch desarrollo && git pull && git switch -c feat/aseguradoras
```

### 2.2 Levantar el entorno

La base en Docker:

```bash
docker compose up -d db
```

Backend y frontend, cada uno en su terminal (se recargan solos al guardar):

```bash
npm run dev:back
```

```bash
npm run dev:front
```

Abrí `http://localhost:5173`. Las llamadas a `/api` las redirige Vite al backend (`localhost:3000`).

> Si antes tenías todo el compose levantado, corré primero `docker compose stop backend frontend`: el contenedor del
> backend ocupa el puerto 3000 y `dev:back` no podría arrancar.

Si la base está vacía (clon nuevo), cargá estructura y datos de prueba:

```bash
npm run prisma:migrate:dev -w backend
```

```bash
npm run seed:dev -w backend
```

Usuarios de prueba: `superadmin@cova.test`, `admin@cova.test` y `gestor@cova.test` (contraseñas en
`backend/prisma/seeds/desarrollo.ts`).

### 2.3 Programar

| Parte           | Dónde                                | Qué va                                       |
| --------------- | ------------------------------------ | -------------------------------------------- |
| Validaciones    | `shared/src/schemas/<modulo>.ts`     | Esquemas Zod (los usan el front y el back)   |
| Backend         | `backend/src/modules/<modulo>/`      | `routes` → `controller` → `service` (Prisma) |
| Frontend        | `frontend/src/features/<modulo>/`    | `api/`, `components/`, `hooks/`, `pages/`    |
| Catálogos       | `backend/prisma/seeds/catalogos.ts`  | Datos de referencia que necesita producción  |
| Datos de prueba | `backend/prisma/seeds/desarrollo.ts` | Datos ficticios solo para desarrollo         |

### 2.4 Si cambiás la base de datos

1. Editá `backend/prisma/schema.prisma`.
2. Generá y aplicá la migración en tu base local:

   ```bash
   npm run prisma:migrate:dev -w backend -- --name descripcion-del-cambio
   ```

3. **Leé el `migration.sql` generado** en `backend/prisma/migrations/<fecha>_descripcion-del-cambio/` (ver
   [sección 5](#5-cuidados-con-las-migraciones)).
4. Commiteá la migración **junto con el código** que la usa.

Reglas:

- Nunca edites una migración que ya se aplicó (Prisma guarda un checksum de cada una).
- Nunca uses `prisma db push`: se saltea el historial y los CHECK de baja lógica.
- Si una tabla nueva tiene baja lógica (`eliminado` + `fechaBaja`), agregá su CHECK en la migración (modelo en
  `backend/prisma/soft-delete-checks.sql`), usando `--create-only` y editando el SQL antes de aplicarlo.

### 2.5 Si agregás una variable de entorno

1. Sumala a la validación en `backend/src/config/env.ts`.
2. Sumala a `backend/.env.example` con un comentario.
3. **Cargala en el `backend/.env` del VPS antes de desplegar.** Si falta, el backend no arranca en producción (la
   validación lo frena).

### 2.6 Antes de abrir el Pull Request

```bash
npm run typecheck && npm run lint && npm run format:check && npm run build
```

Opcional, para probar la versión de producción en `http://localhost:8080`:

```bash
docker compose up -d --build --wait
```

### 2.7 Subir los cambios

1. Push de la rama y PR de `feat/aseguradoras` → `desarrollo`.
2. Cuando `desarrollo` está estable, PR de `desarrollo` → `main`.
3. Deploy en el VPS (sección 3).

---

## 3. Deploy en producción

Por SSH en el VPS (`ssh deploy@IP-DEL-VPS`).

### 3.1 Backup (siempre antes de desplegar, obligatorio si hay migraciones nuevas)

```bash
cd ~/siniestros-cova && docker compose exec -T db pg_dump -U cova -Fc siniestros > ~/backup-$(date +%F-%H%M).dump
```

### 3.2 Actualizar

```bash
cd ~/siniestros-cova && git switch main && git pull --ff-only && docker compose up -d --build --wait
```

- `git switch main`: asegura que se despliega `main`, aunque el servidor haya quedado en otra rama.
- `--ff-only`: si el código del servidor fue modificado a mano o no coincide con GitHub, se frena con error en lugar
  de mezclar cambios en producción.

### 3.3 Verificar

```bash
docker compose ps
```

`db`, `backend` y `frontend` tienen que estar `healthy`, y `migrate` en `Exited (0)`.

```bash
docker compose logs migrate
```

Muestra las migraciones aplicadas (o "No pending migrations") y la seed de catálogos.

Desde el navegador: `https://DOMINIO/api/health` tiene que responder `"db":"ok"` (`DOMINIO` = el `DOMAIN` del `.env`
de la raíz del VPS; sin dominio propio, `IP-CON-GUIONES.sslip.io`).

### 3.4 Limpieza (cada tanto)

Cada deploy deja imágenes viejas que ocupan disco:

```bash
docker image prune -f
```

---

## 4. Qué pasa en el deploy y por qué no se pierde la base

```
git switch main + git pull       →  baja el código nuevo de main
docker compose up -d --build     →  1. construye las imágenes nuevas (el sitio sigue andando mientras tanto)
                                    2. db: no se toca; los datos viven en el volumen db_data
                                    3. migrate: aplica SOLO las migraciones nuevas + la seed de catálogos (idempotente)
                                    4. backend y frontend: se reemplazan por la versión nueva (unos segundos sin servicio)
```

- Los datos de Postgres están en el **volumen `db_data`**, que sobrevive a cualquier reemplazo de contenedores.
- Lo único que cambia la base son las **migraciones nuevas**. Prisma registra cuáles ya se aplicaron en la tabla
  `_prisma_migrations` y no las repite.
- El backend arranca **solo si `migrate` terminó bien**: nunca corre contra una base sin migrar.

---

## 5. Cuidados con las migraciones

Docker no borra datos. **Las que sí pueden borrar datos o romper el deploy son las migraciones:**

| Situación                                              | Qué pasa                                                                                                         | Cómo evitarlo                                                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Renombrar** un campo o tabla en `schema.prisma`      | Prisma no detecta el cambio de nombre: genera `DROP` de lo viejo y `ADD` de lo nuevo. **Se pierden esos datos.** | Crear la migración con `--create-only` y reemplazar ese SQL por `ALTER TABLE ... RENAME COLUMN ...` |
| **Borrar** un campo o modelo                           | Se borran esos datos (definitivo)                                                                                | Revisar el `migration.sql` antes de mergear                                                         |
| **Agregar un campo obligatorio** a una tabla con filas | En tu PC puede funcionar (tabla casi vacía); en producción la migración falla                                    | Darle un valor por defecto, o crearlo opcional y completarlo después                                |
| **Una migración falla** en el deploy                   | El backend nuevo no arranca: **el sitio queda caído** hasta corregirla                                           | Ver `docker compose logs migrate`, corregir con una migración nueva y volver a desplegar            |

Reglas de oro:

1. **Leer siempre el `migration.sql`** antes de mergear. Si aparece `DROP`, confirmar que está bien perder esos datos.
2. **Backup antes de cada deploy** (sección 3.1).
3. Preferir cambios que **solo agregan** (campos opcionales, tablas nuevas). Los que quitan o renombran, hacerlos con
   cuidado y revisando el SQL.

---

## 6. Si un deploy sale mal

**Volver el código a la versión anterior:**

```bash
cd ~/siniestros-cova && git log --oneline -5
```

```bash
git switch --detach <commit-anterior> && docker compose up -d --build --wait
```

Cuando esté corregido en `main`, volver a desplegar normalmente (sección 3.2): `git switch main` sale del commit
anterior.

**Ojo:** volver el código **no deshace las migraciones** ya aplicadas. Si una migración dañó datos, hay que restaurar el
backup:

```bash
docker compose stop backend frontend
```

```bash
docker compose exec -T db pg_restore -U cova -d siniestros --clean --if-exists < ~/backup-AAAA-MM-DD-HHMM.dump
```

```bash
docker compose up -d --wait
```

---

## 7. Reglas que no hay que romper

| Regla                                                                              | Por qué                                                                       |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| En el VPS no se edita código: todo cambio llega por `git pull` desde `main`        | Si no, lo que corre en producción deja de coincidir con GitHub                |
| Los `.env` no van a Git y son distintos en cada entorno                            | Tienen secretos y configuración propia de cada lugar                          |
| `npm run seed:dev` jamás en producción                                             | Carga usuarios de prueba con contraseñas conocidas (además se niega a correr) |
| `docker compose down -v` jamás en el VPS (ni en tu PC si no querés perder tu base) | `-v` borra el volumen: la base completa                                       |
| Un solo clon del repo por máquina                                                  | Por el nombre de proyecto fijo, dos clones comparten contenedores y base      |
| No cargar datos reales sin HTTPS activo                                            | El tráfico viaja sin cifrar                                                   |

---

## 8. Checklist rápido

**Programando un módulo**

- [ ] Rama `feat/...` creada desde `desarrollo` actualizado
- [ ] `docker compose up -d db` + `npm run dev:back` + `npm run dev:front`
- [ ] Si cambié la base: migración creada, `migration.sql` revisado y commiteado
- [ ] Si agregué variables de entorno: `env.ts` + `.env.example` (y anotado cargarla en el VPS)
- [ ] `typecheck`, `lint`, `format:check` y `build` en verde
- [ ] PR a `desarrollo` → luego PR a `main`

**Desplegando**

- [ ] Variables nuevas cargadas en el `backend/.env` del VPS
- [ ] Backup de la base (sección 3.1)
- [ ] `git switch main && git pull --ff-only && docker compose up -d --build --wait`
- [ ] `docker compose ps` todo `healthy`, `migrate` en `Exited (0)`
- [ ] `/api/health` responde `"db":"ok"`
