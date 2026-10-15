#!/bin/sh
# Hace un backup en el momento (base + documentos) y lo sube a Cloudflare R2. Usarlo antes de cada deploy.
#
# Uso, desde la raíz del repo (en el VPS o en tu PC):
#   sh scripts/backup-ahora.sh
#
# Si el servicio "backup" está corriendo (COMPOSE_PROFILES incluye backup), lo hace dentro de él; si no, levanta uno
# de un solo uso. Ver backup/backup.sh.
set -eu
. "$(dirname "$0")/backup-comun.sh"

en_backup backup
en_backup estado
