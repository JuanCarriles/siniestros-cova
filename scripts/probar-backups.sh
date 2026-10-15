#!/bin/sh
# Verificación completa de los backups contra R2. No modifica datos de la app: se puede correr en el VPS (por ejemplo
# después de cada deploy o una vez por semana) y en tu PC.
#   1. hace un backup en el momento
#   2. revisa el estado del servicio de backup
#   3. descarga ese backup de R2, lo descifra, lo restaura en una base temporal, lo compara y la borra
#   4. comprueba que cada documento de la app esté en el backup (mismo contenido)
#   5. simula una restauración de todos los documentos (muestra qué copiaría, sin copiar nada)
# Al final muestra un resumen y sale con error si algún paso falló.
#
# Uso, desde la raíz del repo:
#   sh scripts/probar-backups.sh
set -eu
. "$(dirname "$0")/backup-comun.sh"

case "${1:-}" in -h | --help) uso && exit 0 ;; esac

resumen=""
fallos=0
paso() {
  titulo=$1
  shift
  echo
  echo "=== $titulo"
  if "$@"; then
    resumen="$resumen  OK     $titulo\n"
  else
    resumen="$resumen  FALLÓ  $titulo\n"
    fallos=$((fallos + 1))
  fi
}

paso "1. Backup en el momento" en_backup backup
paso "2. Estado del servicio de backup" en_backup estado
paso "3. Restauración de la base desde R2 (en una base temporal)" en_backup restaurar probar ultimo
paso "4. Todos los documentos están en el backup" en_backup restaurar verificar-documentos
paso "5. Restauración de documentos simulada" en_backup restaurar documentos actual --prueba

echo
echo "=== Resumen"
printf '%b' "$resumen"
if [ "$fallos" -gt 0 ]; then
  echo "$fallos paso(s) fallaron: revisá el detalle de cada uno más arriba."
  exit 1
fi
echo "Todo correcto."
