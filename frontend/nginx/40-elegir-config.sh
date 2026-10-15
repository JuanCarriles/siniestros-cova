#!/bin/sh
# Elige la configuración de Nginx al arrancar el contenedor (la imagen oficial ejecuta los scripts de
# /docker-entrypoint.d/ antes de iniciar Nginx):
#   - HTTPS: si hay DOMAIN y ya existe su certificado de Let's Encrypt.
#   - Solo HTTP: en cualquier otro caso (desarrollo local, o VPS antes de obtener el primer certificado).
set -eu

CERT="/etc/letsencrypt/live/${DOMAIN:-}/fullchain.pem"

if [ -n "${DOMAIN:-}" ] && [ -f "$CERT" ]; then
  # Solo se reemplaza ${DOMAIN}; las variables propias de Nginx ($host, $uri...) quedan intactas
  envsubst '${DOMAIN}' < /etc/nginx/plantillas/https.conf > /etc/nginx/conf.d/default.conf
  echo "40-elegir-config: HTTPS para ${DOMAIN}"

  # Certbot renueva el certificado en su propio contenedor; Nginx lo toma al recargar.
  # Se recarga cada 6 horas (una recarga no corta las conexiones abiertas).
  (while sleep 6h; do nginx -s reload; done) &
else
  cp /etc/nginx/plantillas/http.conf /etc/nginx/conf.d/default.conf
  if [ -n "${DOMAIN:-}" ]; then
    echo "40-elegir-config: solo HTTP (todavía no hay certificado para ${DOMAIN})"
  else
    echo "40-elegir-config: solo HTTP (sin DOMAIN)"
  fi
fi
