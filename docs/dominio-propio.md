# Pasar a un dominio propio

Hoy el sistema funciona con HTTPS usando `IP-CON-GUIONES.sslip.io`, un nombre gratuito que apunta solo a la IP del
VPS. Esta guía explica qué hacer cuando compremos el dominio definitivo (por ejemplo `siniestroscova.com.ar`).

No hay que tocar código: solo DNS, dos archivos `.env` del VPS y un certificado nuevo. Lleva unos 15 minutos más lo
que tarde en propagarse el DNS.

En los ejemplos, `midominio.com.ar` es el dominio nuevo y `203-0-113-10.sslip.io` el actual: reemplazalos por los
reales.

## Qué ganamos

| Hoy con sslip.io                                                                                                         | Con dominio propio                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Dirección difícil de recordar, con la IP adentro                                                                         | Dirección propia y profesional para los usuarios y el cliente                                           |
| Depende de un servicio de terceros (sslip.io): si deja de funcionar, el sitio no se encuentra                            | El nombre lo controlamos nosotros                                                                       |
| Si cambiamos de VPS, cambia la IP y cambia la dirección del sitio                                                        | Se cambia de servidor actualizando un registro DNS; los usuarios siguen entrando por la misma dirección |
| No se pueden enviar mails propios: Resend exige verificar un dominio (RF-05 recuperar contraseña, RF-30 informe mensual) | Se verifica el dominio en Resend y los mails salen desde `no-reply@midominio.com.ar`, sin caer en spam  |
| Certificado emitido para un nombre que no es nuestro                                                                     | Certificado a nombre del dominio del sistema                                                            |

## Antes de empezar

- El sistema ya funciona con HTTPS en sslip.io (`https://203-0-113-10.sslip.io/api/health` responde `"db":"ok"`).
- Avisar a los usuarios: al cambiar de dominio **todas las sesiones se cierran** (las cookies pertenecen a cada
  dominio) y durante unos minutos el sitio funciona solo por HTTP.

---

## Paso 1 — Comprar el dominio

**Dónde:** en el navegador.

- `.com.ar` en [NIC Argentina](https://nic.ar) (requiere clave fiscal) o en cualquier registrador.
- También se puede comprar desde el panel de Hostinger.

## Paso 2 — Apuntar el dominio al VPS

**Dónde:** en el panel de DNS del lugar donde compraste el dominio (en NIC Argentina se delega a los DNS del proveedor
que elijas; si el dominio está en Hostinger, en **Dominios → DNS**).

Crear un registro **A**:

| Tipo | Nombre                | Valor      | TTL                 |
| ---- | --------------------- | ---------- | ------------------- |
| A    | `@` (el dominio raíz) | IP del VPS | 3600 (o el default) |

Si existe otro registro A o AAAA para `@` que apunte a otro lado (por ejemplo, a una página de "dominio estacionado"),
borralo.

## Paso 3 — Esperar a que el DNS apunte al VPS

**Dónde:** en tu PC. Puede tardar de minutos a unas horas.

```bash
nslookup midominio.com.ar
```

Tiene que mostrar la IP del VPS en "Address". Hasta que eso pase, no sigas: Let's Encrypt no podría validar el
dominio.

## Paso 4 — Cambiar el dominio en el VPS

**Dónde:** en el VPS por SSH (`ssh deploy@IP-DEL-VPS`), en la carpeta del proyecto.

```bash
cd ~/siniestros-cova
```

Cambiar `DOMAIN` en el `.env` de la raíz:

```bash
sed -i "s|^DOMAIN=.*|DOMAIN=midominio.com.ar|" .env && grep ^DOMAIN= .env
```

Cambiar la URL del sistema en `backend/.env` (se usa en los links de los mails):

```bash
sed -i "s|^APP_URL=.*|APP_URL=https://midominio.com.ar|" backend/.env && grep ^APP_URL= backend/.env
```

Aplicar los cambios:

```bash
docker compose up -d --wait
```

Nginx arranca en **modo solo HTTP**, porque todavía no hay certificado para el dominio nuevo. Comprobalo en el
navegador con `http://midominio.com.ar/api/health` (`"db":"ok"`). En este momento el login todavía no funciona (la
cookie de sesión exige HTTPS): es normal hasta el paso 5.

## Paso 5 — Obtener el certificado del dominio nuevo

**Dónde:** en el VPS, en la carpeta del proyecto. Al correrlo se acepta el acuerdo de suscriptor de Let's Encrypt.

```bash
sh scripts/obtener-certificado.sh
```

El script verifica que el dominio llegue al VPS, pide el certificado, reinicia Nginx en modo HTTPS y deja activa la
renovación automática. Al final muestra la respuesta de `https://midominio.com.ar/api/health`.

## Paso 6 — Verificar

**Dónde:** en el navegador y en el VPS.

- `https://midominio.com.ar` carga la aplicación con el candado del navegador.
- `http://midominio.com.ar` redirige solo a `https://`.
- La renovación automática va a funcionar (tiene que terminar con "all simulated renewals succeeded"):

```bash
docker compose exec certbot certbot renew --dry-run
```

## Paso 7 — Borrar el certificado viejo de sslip.io

**Dónde:** en el VPS. Si no se borra, Certbot sigue intentando renovarlo cada 12 horas sin necesidad.

```bash
docker compose exec certbot certbot certificates
```

```bash
docker compose exec certbot certbot delete --cert-name 203-0-113-10.sslip.io
```

## Paso 8 — Mails con el dominio (cuando se implemente el envío)

**Dónde:** en el panel de Resend y en el panel de DNS del dominio.

1. En Resend, agregar el dominio (**Domains → Add domain**). Resend muestra unos registros DNS (SPF, DKIM y,
   opcionalmente, DMARC).
2. Crearlos en el panel de DNS del dominio y esperar a que Resend lo marque como verificado.
3. En `backend/.env` del VPS, `MAIL_FROM="Estudio Cova <no-reply@midominio.com.ar>"`, y aplicarlo con
   `docker compose up -d --wait backend`.

---

## Si algo sale mal

| Síntoma                                                  | Qué revisar                                                                                                                               |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| El script dice que `http://midominio.com.ar` no responde | `nslookup` (paso 3), puerto 80 abierto (`sudo ufw status` y firewall del panel del proveedor), `docker compose ps`                        |
| Let's Encrypt rechaza la validación                      | Que no haya otro registro A/AAAA apuntando a otro servidor; esperar a que termine de propagarse el DNS                                    |
| Después del paso 5 el sitio sigue en HTTP                | `docker compose logs frontend` tiene que decir `40-elegir-config: HTTPS para midominio.com.ar`; si no, `docker compose restart frontend`  |
| Hay que volver atrás rápido                              | Volver `DOMAIN` y `APP_URL` al valor de sslip.io y `docker compose up -d --wait`: su certificado sigue guardado (si no hiciste el paso 7) |

Límite a tener en cuenta: Let's Encrypt emite hasta 5 certificados iguales por semana para el mismo dominio. Si hay
que repetir pruebas, usar primero `STAGING=1 sh scripts/obtener-certificado.sh` (certificado de prueba, sin límite).

## Opcional: también `www.midominio.com.ar`

El script obtiene el certificado para un solo nombre. Si además se quiere que funcione `www.`, hace falta un registro
DNS `CNAME www → midominio.com.ar`, sumar `-d www.midominio.com.ar` al pedido del certificado y una redirección de
`www` al dominio principal en Nginx. Es un cambio chico; hacerlo si el cliente lo pide.
