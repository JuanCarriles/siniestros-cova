# Deploy y operación en producción

Todo lo necesario para poner el sistema en un VPS, mantenerlo, restaurarlo y recuperarlo si se pierde el servidor.
Está pensado para que **cualquiera del equipo** pueda hacerlo sin ayuda.

- Cómo se programa y cómo llega un cambio a producción: [`docs/flujo-de-trabajo.md`](docs/flujo-de-trabajo.md).
- Pasar de sslip.io a un dominio propio: [`docs/dominio-propio.md`](docs/dominio-propio.md).

**Dónde se corre cada comando:** salvo que diga "en tu PC", todo se corre **en el VPS, por SSH, desde la carpeta del
repo** (`cd ~/siniestros-cova`). Donde aparece `IP`, va la IP del VPS; donde aparece `DOMINIO`, el `DOMAIN` del `.env`
de la raíz (sin dominio propio: `IP-CON-GUIONES.sslip.io`, por ejemplo `203-0-113-10.sslip.io`).

## Índice

1. [Qué hay que tener y guardar fuera del VPS](#1-qué-hay-que-tener-y-guardar-fuera-del-vps)
2. [Preparar el VPS](#2-preparar-el-vps-una-sola-vez)
3. [Cloudflare R2](#3-cloudflare-r2-una-sola-vez)
4. [Primer deploy](#4-primer-deploy)
5. [HTTPS](#5-https)
6. [Backups automáticos](#6-backups-automáticos)
7. [Actualizar a una versión nueva](#7-actualizar-a-una-versión-nueva)
8. [Restaurar](#8-restaurar)
9. [Recuperación ante desastre: se perdió el VPS](#9-recuperación-ante-desastre-se-perdió-el-vps)
10. [Mantenimiento periódico](#10-mantenimiento-periódico)
11. [Problemas frecuentes](#11-problemas-frecuentes)

---

## 1. Qué hay que tener y guardar fuera del VPS

Si el VPS se pierde, todo lo que existe **solo** ahí se pierde con él. Esto tiene que estar guardado en un gestor de
contraseñas (por ejemplo Bitwarden), **compartido con al menos otra persona del equipo**:

| Qué                                         | Para qué                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| Contenido completo del `.env` de la raíz    | Contraseña de Postgres, dominio, perfiles y configuración de backups             |
| Contenido completo de `backend/.env`        | Claves de R2 del backend, de Resend y el resto de la configuración               |
| **`BACKUP_CLAVE`** (va dentro de un `.env`) | **Sin ella los backups de la base no se pueden descifrar.** Es la más importante |
| Acceso al panel de Hostinger                | Crear o reinstalar el VPS, firewall del proveedor                                |
| Acceso a la cuenta de Cloudflare            | Buckets y tokens de R2                                                           |
| Acceso al repo de GitHub                    | Clonar el código                                                                 |
| La clave SSH con la que se entra al VPS     | Conectarse (o poder cargar una nueva desde el panel)                             |

Cada vez que cambies algo en un `.env` del VPS, actualizá también la copia en el gestor.

---

## 2. Preparar el VPS (una sola vez)

Requisitos: Ubuntu 24.04 con Docker (el "Docker manager" de Hostinger lo deja instalado). Con menos de 2 GB de RAM
hace falta swap (paso 6): el build de las imágenes usa mucha memoria.

**1. Conectarte** (en tu PC):

```bash
ssh root@IP
```

**2. Actualizar el sistema.** Si al final pide reiniciar, corré `reboot`, esperá un minuto y volvé a conectarte:

```
apt update && apt upgrade -y
```

**3. Verificar Docker:**

```
docker --version && docker compose version
```

Si alguno da error: `curl -fsSL https://get.docker.com | sh`.

**4. Recomendado: un usuario para trabajar en lugar de root.** Pide una contraseña: generala y guardala en el gestor.

```
adduser deploy
```

```
usermod -aG sudo,docker deploy
```

```
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

Salí con `exit` y probá entrar desde tu PC con `ssh deploy@IP`. Desde acá, todo con ese usuario.

**5. Firewall.** El orden importa: primero se permite SSH y recién después se activa, si no te quedás afuera.

```
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
```

```
sudo ufw enable
```

Revisá también el firewall del panel de Hostinger (**Seguridad → Firewall**): tiene que dejar pasar 22, 80 y 443. La
base (5432) y el backend (3000) escuchan solo en `127.0.0.1`: no hace falta abrirlos.

**6. Swap (solo si el VPS tiene menos de 2 GB de RAM):**

```
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
```

```
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**7. Opcional: cerrar SSH con contraseña y el login de root.** Solo cuando ya entraste bien como `deploy` con la
clave, y dejando la sesión actual abierta mientras probás en otra terminal:

```
printf "PermitRootLogin no\nPasswordAuthentication no\n" | sudo tee /etc/ssh/sshd_config.d/99-seguridad.conf
```

```
sudo sshd -t && sudo systemctl restart ssh
```

---

## 3. Cloudflare R2 (una sola vez)

En el panel de Cloudflare, **R2**:

**Buckets** (privados, sin acceso público):

| Bucket                    | Para qué                                            |
| ------------------------- | --------------------------------------------------- |
| `siniestros-cova`         | Documentos de la app en producción                  |
| `siniestros-cova-backups` | Backups de la base y copia de los documentos        |
| `siniestro-cova-dev`      | Documentos de las PCs de desarrollo (no producción) |

**Tokens** (R2 → Manage API tokens), cada uno **solo** con acceso a su bucket:

| Token   | Permiso                                             | Va en                                                                       |
| ------- | --------------------------------------------------- | --------------------------------------------------------------------------- |
| Backend | Object Read & Write sobre `siniestros-cova`         | `backend/.env`: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`                  |
| Backups | Object Read & Write sobre `siniestros-cova-backups` | `.env` de la raíz: `BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY` |

Así, si el token de la app se filtra, no alcanza para borrar los backups. El ID de la cuenta (`R2_ACCOUNT_ID`) está en la
página principal de R2.

**Regla de limpieza de `altas/`** (en `siniestros-cova` y también en `siniestro-cova-dev`). Durante el alta de un
siniestro los documentos se suben a `altas/{usuario}/`, porque el siniestro todavía no existe; al crearlo pasan a
`siniestros/{id}/`. Lo que queda en `altas/` es de altas abandonadas (se cerró el navegador y nunca se retomaron) o un
original que no se pudo borrar después de moverlo. En el bucket → **Settings** → **Object lifecycle rules** →
**Add rule**:

| Campo      | Valor                                |
| ---------- | ------------------------------------ |
| Nombre     | `altas-abandonadas`                  |
| Alcance    | Prefijo `altas/` (no todo el bucket) |
| Acción     | Borrar objetos                       |
| Después de | 30 días desde que se subieron        |

El prefijo es importante: una regla sobre todo el bucket borraría los documentos de los siniestros. Un siniestro nunca
depende de `altas/`: al crearlo, sus documentos se copian a `siniestros/{id}/` dentro de la misma operación, y si alguno
falta o R2 falla, no se crea. Un alta que se retome después de 30 días avisa qué documentos ya no están para volver a
cargarlos.

**No** agregar reglas de borrado automático (lifecycle) a todo el bucket de backups: borrarían de
`backups/documentos/actual/` documentos que siguen existiendo. La limpieza de lo viejo ya la hace el servicio de
backup. Si se quiere un Bucket Lock, que aplique solo a `backups/db/`.

---

## 4. Primer deploy

**1. Clonar el repo.** Si es privado, primero cargá una deploy key de solo lectura:

```
ssh-keygen -t ed25519 -C "deploy-vps" -f ~/.ssh/id_ed25519 -N "" && cat ~/.ssh/id_ed25519.pub
```

Copiá esa línea en GitHub: repo → **Settings → Deploy keys → Add deploy key** (sin "Allow write access"). Después:

```
git clone git@github.com:JuanCarriles/siniestros-cova.git ~/siniestros-cova && cd ~/siniestros-cova
```

(Si el repo es público: `git clone https://github.com/JuanCarriles/siniestros-cova.git ~/siniestros-cova`.)

**2. Crear el `.env` de la raíz.** Tiene que existir **antes** del primer `up`: Postgres usa la contraseña solo cuando
crea la base. Genera una contraseña aleatoria (solo letras y números) y la clave de los backups:

```
printf "POSTGRES_USER=cova\nPOSTGRES_PASSWORD=%s\nPOSTGRES_DB=siniestros\nBACKUP_CLAVE=%s\n" "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > .env && chmod 600 .env
```

Completalo con `nano .env` (los comentarios de cada variable están en `.env.example`):

```
DOMAIN=IP-CON-GUIONES.sslip.io
HTTP_PORT=80
HTTPS_PORT=443
COMPOSE_PROFILES=ssl,backup
BACKUP_BUCKET=siniestros-cova-backups
BACKUP_R2_ACCESS_KEY_ID=<token de backups>
BACKUP_R2_SECRET_ACCESS_KEY=<token de backups>
```

No pongas `BACKUP_PREFIX`: vacía, los backups van a la carpeta `backups/` (las PCs de desarrollo usan otra).

**3. Crear `backend/.env`:**

```
cp backend/.env.example backend/.env && chmod 600 backend/.env
```

Con `nano backend/.env`, completá (sin espacios después del `=`):

```
APP_URL=http://DOMINIO
COOKIE_SECURE=false
R2_ACCOUNT_ID=<id de la cuenta>
R2_ACCESS_KEY_ID=<token del backend>
R2_SECRET_ACCESS_KEY=<token del backend>
R2_BUCKET=siniestros-cova
RESEND_API_KEY=<clave de la API de Resend>
```

**Mails (Resend).** Sin `RESEND_API_KEY` el sistema funciona, pero no salen los mails de recuperación de contraseña: la
pantalla responde igual (a propósito no dice si el mail existe) y el error solo queda en `docker compose logs
backend`. Mientras no haya dominio propio, el remitente es `onboarding@resend.dev` y Resend **solo entrega al mail del
dueño de la cuenta de Resend**. Con dominio propio, verificarlo en Resend y cambiar `RESEND_FROM` (ver
[`docs/dominio-propio.md`](docs/dominio-propio.md)).

`APP_URL` y `COOKIE_SECURE` se cambian en la sección 5. `DATABASE_URL` y `NODE_ENV` los pone el compose.

**4. Guardar los dos `.env` en el gestor de contraseñas** (sección 1). Para verlos completos: `cat .env backend/.env`.

**5. Construir y levantar.** Con 1 vCPU el primer build tarda varios minutos:

```
docker compose up -d --build --wait
```

**6. Verificar:**

```
docker compose ps
```

`db`, `backend`, `frontend` y `backup` en `healthy`, y `migrate` en `Exited (0)`.

```
docker compose logs migrate
```

Tiene que mostrar la migración aplicada y los catálogos: 24 provincias, 7 estados y 4 tipos de documento.

```
curl -s http://127.0.0.1:3000/api/health
```

Tiene que devolver `"db":"ok"`. Desde el navegador: `http://DOMINIO/api/health`.

**7. Crear el primer superadministrador.** La base de producción arranca sin usuarios (la seed de desarrollo no corre
en producción: sus contraseñas están en el repo):

```
docker compose exec backend node dist/crear-superadmin.mjs EMAIL "NOMBRES" "APELLIDOS"
```

Muestra una contraseña generada al azar **una sola vez**: guardala en el gestor de contraseñas. Documento y teléfono
quedan como `PENDIENTE`; se corrigen desde "Mi perfil". Si ya hay un superadministrador, no hace nada.

---

## 5. HTTPS

Con el sitio respondiendo por `http://DOMINIO` (el puerto 80 tiene que llegar al VPS):

```
sh scripts/obtener-certificado.sh
```

Al correrlo se acepta el acuerdo de suscriptor de Let's Encrypt. Para probar sin gastar el límite de certificados:
`STAGING=1 sh scripts/obtener-certificado.sh`.

Después, en `backend/.env`: `APP_URL=https://DOMINIO` y `COOKIE_SECURE=true`, y aplicarlo:

```
docker compose up -d --wait backend
```

Verificar: `https://DOMINIO/api/health` responde `"db":"ok"` con el candado del navegador.

La renovación es automática: el servicio `certbot` intenta cada 12 h (renueva cuando faltan menos de 30 días) y Nginx
recarga cada 6 h. Para comprobar que va a funcionar:

```
docker compose exec certbot certbot renew --dry-run
```

---

## 6. Backups automáticos

Con `COMPOSE_PROFILES=ssl,backup`, el servicio `backup` hace **todos los días a las 3:00** (hora de Argentina):

1. un dump de la base, verificado y **cifrado** con `BACKUP_CLAVE`, que sube a `siniestros-cova-backups/backups/db/`;
2. una copia de los documentos en `backups/documentos/actual/`. Lo que se borra o se reemplaza en la app pasa a
   `backups/documentos/historial/<fecha>/`;
3. borra lo de más de **30 días** en R2 y de más de 7 días en el VPS (los dumps locales sirven para restaurar sin
   descargar).

Si un backup falla, reintenta 2 veces con una hora de diferencia. Si el VPS estaba apagado a las 3:00, hace uno al
arrancar.

**Cómo saber si anda:**

```
docker compose exec backup estado
```

Muestra el último backup exitoso y la última restauración de prueba. En `docker compose ps` el servicio queda
`unhealthy` si el último backup falló o tiene más de 26 h. El detalle de cada backup: `docker compose logs backup`.

**Verificación completa** (no modifica datos de la app; correrla después del primer deploy y una vez por semana):

```
sh scripts/probar-backups.sh
```

Hace un backup, lo descarga de R2, lo descifra, lo restaura en una base temporal y lo compara, comprueba que cada
documento esté en el backup y simula restaurarlos. Termina con un resumen: todo tiene que dar `OK`.

**Backup en el momento** (antes de cada deploy, o de cualquier cambio delicado):

```
sh scripts/backup-ahora.sh
```

### Scripts de backup y restauración

| Script                                               | Qué hace                                                             |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| `sh scripts/backup-ahora.sh`                         | Backup en el momento                                                 |
| `sh scripts/probar-backups.sh`                       | Verificación completa sin modificar datos                            |
| `sh scripts/probar-restauracion.sh [NOMBRE]`         | Restaura un backup en una base temporal, la compara y la borra       |
| `sh scripts/restaurar-backup.sh --listar`            | Backups disponibles, historial de documentos y bases guardadas       |
| `sh scripts/restaurar-backup.sh ultimo` (o `NOMBRE`) | Reemplaza la base por un backup. La actual queda guardada            |
| `sh scripts/restaurar-backup.sh --volver-a BASE`     | Vuelve a una base guardada (deshace una restauración)                |
| `sh scripts/restaurar-documentos.sh ORIGEN [RUTA]`   | Devuelve documentos que falten en la app, sin sobrescribir ni borrar |

Todos aceptan `--help`. Funcionan aunque el servicio `backup` no esté corriendo (levantan uno de un solo uso).

---

## 7. Actualizar a una versión nueva

El detalle (ramas, PRs, cuidados con las migraciones) está en
[`docs/flujo-de-trabajo.md`](docs/flujo-de-trabajo.md#3-deploy-en-producción). En resumen, después de mergear a `main`:

```
sh scripts/backup-ahora.sh
```

```
git switch main && git pull --ff-only && docker compose up -d --build --wait
```

```
docker compose ps
```

Si la versión nueva agrega variables de entorno, cargalas en el `.env` que corresponda **antes** del `up` (y en el
gestor de contraseñas).

---

## 8. Restaurar

Primero mirá qué hay disponible:

```
sh scripts/restaurar-backup.sh --listar
```

Los backups se llaman `siniestros-AAAA-MM-DD-HHMM.dump`. Los de las 3:00 son los automáticos; los de otras horas, los
hechos a mano (por ejemplo antes de un deploy).

### Una migración o un error dañó datos de la base

Restaurá el backup de **antes** del problema (normalmente el que hiciste antes del deploy):

```
sh scripts/restaurar-backup.sh siniestros-AAAA-MM-DD-HHMM.dump
```

Qué hace:

1. restaura el backup en una base aparte mientras el sitio sigue funcionando, y muestra las filas por tabla del backup
   y de la base actual;
2. pide escribir `RESTAURAR`;
3. detiene backend y frontend, cambia la base actual por la restaurada (las dos a la vez, o ninguna si algo falla) y
   los vuelve a levantar. `migrate` aplica las migraciones que el backup no tenga.

**La base anterior no se borra**: queda como `siniestros_antes_AAAAMMDD_HHMMSS`. Si te equivocaste de backup:

```
sh scripts/restaurar-backup.sh --volver-a siniestros_antes_AAAAMMDD_HHMMSS
```

Si R2 no responde, se puede usar la copia que queda en el VPS (últimos 7 días) agregando `--local`.

Los documentos **no** se tocan al restaurar la base: siguen en el bucket. Si también faltan, ver abajo.

**Ojo con `ultimo`:** restaura el backup más reciente. Si el problema ocurrió antes de ese backup, el último ya tiene los
datos dañados. Ante la duda, elegí el nombre con `--listar`.

### Se borraron o reemplazaron documentos

```
sh scripts/restaurar-documentos.sh --listar
```

- Si **no** hubo un backup desde que se borraron, están en la copia `actual`:

  ```
  sh scripts/restaurar-documentos.sh actual
  ```

- Si **hubo** un backup después (por ejemplo el de las 3:00), ese backup los movió al historial con su fecha. Usá la
  fecha del primer backup posterior al borrado:

  ```
  sh scripts/restaurar-documentos.sh AAAA-MM-DD-HHMM
  ```

Se puede limitar a una carpeta o archivo agregando la ruta, por ejemplo `siniestros/123` o
`siniestros/123/archivo.pdf`. Primero muestra qué va a copiar y pide escribir `SI`. **Nunca sobrescribe ni borra**: solo
agrega los que faltan. Si dice "Se copiarían 0 archivo(s)", probá con el otro origen.

### Borrar las bases guardadas

Cuando ya no hagan falta (ocupan espacio en el VPS):

```
docker compose exec db dropdb -U cova siniestros_antes_AAAAMMDD_HHMMSS
```

---

## 9. Recuperación ante desastre: se perdió el VPS

Los documentos y los backups están en R2, no en el VPS: no se pierden con él. Para volver a tener el sistema en un VPS
nuevo:

**1. Preparar el VPS nuevo** (sección 2) y clonar el repo (sección 4, paso 1).

**2. Recrear los dos `.env`** con el contenido guardado en el gestor de contraseñas (`nano .env`,
`nano backend/.env`, y `chmod 600` a los dos). Lo imprescindible es que `BACKUP_CLAVE` y las claves de R2 sean las
mismas.

- **Sacá `backup` de `COMPOSE_PROFILES` por ahora** (`COMPOSE_PROFILES=ssl`). Si no, al arrancar haría un backup de la
  base nueva, que está vacía, y ese pasaría a ser "el último".
- Si cambió la IP y usan sslip.io, actualizá `DOMAIN` y `APP_URL` con la IP nueva. Con dominio propio, apuntá el
  registro `A` del DNS a la IP nueva.
- Hasta tener el certificado: `APP_URL=http://DOMINIO` y `COOKIE_SECURE=false`.

**3. Levantar** (crea una base vacía con los catálogos):

```
docker compose up -d --build --wait
```

**4. Restaurar la base desde R2.** Elegí el último backup bueno por su nombre:

```
sh scripts/restaurar-backup.sh --listar
```

```
sh scripts/restaurar-backup.sh siniestros-AAAA-MM-DD-HHMM.dump
```

**5. Documentos:** si el bucket de la app está bien, no hay nada que hacer. Si también se perdió, restaurá la copia:
`sh scripts/restaurar-documentos.sh actual`.

**6. HTTPS** (sección 5).

**7. Volver a activar los backups:** en el `.env`, `COMPOSE_PROFILES=ssl,backup`, y:

```
docker compose up -d --wait
```

```
sh scripts/probar-backups.sh
```

---

## 10. Mantenimiento periódico

| Cuándo                 | Qué                                                                   |
| ---------------------- | --------------------------------------------------------------------- |
| Antes de cada deploy   | `sh scripts/backup-ahora.sh`                                          |
| Después de cada deploy | `docker compose ps`: todo `healthy`                                   |
| Una vez por semana     | `sh scripts/probar-backups.sh`: todo `OK`                             |
| Una vez por mes        | `docker image prune -f` (imágenes viejas de cada deploy)              |
| Una vez por mes        | `df -h /`: espacio en disco                                           |
| Cada tanto             | `sudo apt update && sudo apt upgrade -y` (y `sudo reboot` si lo pide) |
| Al cambiar un `.env`   | Actualizar la copia en el gestor de contraseñas                       |

---

## 11. Problemas frecuentes

| Síntoma                                                         | Causa probable y solución                                                                                                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backup` en `unhealthy`                                         | `docker compose exec backup estado` y `docker compose logs backup` dicen el motivo. Casi siempre es una variable que falta o un permiso del token                                                 |
| `AccessDenied` al leer documentos o escribir backups            | El token no tiene permiso sobre ese bucket (sección 3), o el `R2_BUCKET` / `BACKUP_BUCKET` está mal escrito                                                                                       |
| "la BACKUP_CLAVE no es la misma con la que se hizo este backup" | El `.env` tiene otra clave. Recuperá la correcta del gestor de contraseñas                                                                                                                        |
| `docker compose up --wait` falla solo por `backup`              | La app igual quedó andando; el problema es del backup (ver la primera fila)                                                                                                                       |
| `migrate` termina con error                                     | `docker compose logs migrate`. El backend no arranca hasta corregirlo: ver [cuidados con las migraciones](docs/flujo-de-trabajo.md#5-cuidados-con-las-migraciones) y, si dañó datos, la sección 8 |
| `P1000: Authentication failed` en `migrate`                     | La base se creó con otra contraseña. **No** borres el volumen: volvé a poner en `.env` la `POSTGRES_PASSWORD` original (está en el gestor)                                                        |
| El certificado no se obtiene                                    | `http://DOMINIO` tiene que llegar al VPS: DNS, puerto 80 abierto (ufw y Hostinger) y `HTTP_PORT=80`                                                                                               |
| El login no funciona por http                                   | Con `COOKIE_SECURE=true` el navegador solo manda la cookie por https. Usá https, o `COOKIE_SECURE=false` mientras no haya certificado                                                             |
| Restaurar pide confirmar y dice "Cancelado"                     | Hay que escribir la palabra que pide (`RESTAURAR` o `SI`). No se cambió nada                                                                                                                      |
| Falta espacio en disco                                          | `docker image prune -f`, y borrar las bases `siniestros_antes_*` que ya no hagan falta (sección 8)                                                                                                |

**Nunca** correr `docker compose down -v` en el VPS: `-v` borra el volumen de la base.
