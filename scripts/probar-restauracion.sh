#!/bin/sh
# Prueba la restauración sin tocar nada (RNF-05): descarga un backup de R2, lo descifra, lo restaura en una base
# temporal, la compara con la actual y la borra. Se puede correr en producción en cualquier momento.
#
# Uso, desde la raíz del repo (en el VPS o en tu PC):
#   sh scripts/probar-restauracion.sh           el último backup
#   sh scripts/probar-restauracion.sh NOMBRE    uno en particular (los disponibles: restaurar-backup.sh --listar)
set -eu
. "$(dirname "$0")/backup-comun.sh"

case "${1:-}" in -h | --help) uso && exit 0 ;; esac
en_backup restaurar probar "${1:-ultimo}"
