#!/bin/sh
# Obtiene el PRIMER certificado SSL de Let's Encrypt para el DOMAIN del .env y pasa Nginx a HTTPS.
# Las renovaciones posteriores son automáticas (servicio "certbot" del compose).
#
# Uso, en el VPS desde la raíz del repo y con el compose levantado:
#   sh scripts/obtener-certificado.sh
# Prueba contra el entorno de pruebas de Let's Encrypt (certificado no válido, sin límites de cantidad):
#   STAGING=1 sh scripts/obtener-certificado.sh
#
# Al correrlo aceptás el acuerdo de suscriptor de Let's Encrypt: https://letsencrypt.org/repository/
set -eu
cd "$(dirname "$0")/.."

DOMAIN=$(grep -E '^DOMAIN=' .env 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '"'"'"' \r')
if [ -z "$DOMAIN" ]; then
  echo "Falta DOMAIN en el .env de la raíz (por ejemplo DOMAIN=203-0-113-10.sslip.io)." >&2
  exit 1
fi

echo "1/4  Verificando que http://$DOMAIN llegue a este servidor..."
if ! curl -fsS -o /dev/null --max-time 10 "http://$DOMAIN/"; then
  echo "http://$DOMAIN no responde. Revisá que el DNS apunte a este VPS, que el puerto 80 esté abierto" >&2
  echo "(ufw y firewall de Hostinger) y que el compose esté levantado con HTTP_PORT=80." >&2
  exit 1
fi

PRUEBA=""
if [ "${STAGING:-}" = "1" ]; then
  PRUEBA="--test-cert"
  echo "     (modo prueba: certificado del entorno de pruebas de Let's Encrypt, NO válido para navegadores)"
fi

echo "2/4  Pidiendo el certificado a Let's Encrypt..."
docker compose run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" \
  --agree-tos --register-unsafely-without-email --non-interactive \
  $PRUEBA

echo "3/4  Reiniciando Nginx en modo HTTPS y dejando activa la renovación automática..."
docker compose restart frontend
docker compose up -d certbot

echo "4/4  Verificando https://$DOMAIN/api/health ..."
sleep 3
if [ -n "$PRUEBA" ]; then
  curl -ksS "https://$DOMAIN/api/health" && echo
else
  curl -fsS "https://$DOMAIN/api/health" && echo
fi

echo
echo "Listo. Ahora en backend/.env: APP_URL=https://$DOMAIN y COOKIE_SECURE=true,"
echo "y aplicalo con: docker compose up -d --wait backend"
