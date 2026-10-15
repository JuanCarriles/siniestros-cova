#!/bin/sh
# Devuelve documentos del backup de R2 al bucket de la app. Nunca sobrescribe ni borra documentos que ya existen: solo
# copia los que faltan. Primero muestra qué se va a copiar y pide confirmación.
#
# Uso, desde la raíz del repo (en el VPS o en tu PC):
#   sh scripts/restaurar-documentos.sh --listar               orígenes disponibles
#   sh scripts/restaurar-documentos.sh actual                 todos los documentos de la copia del último backup
#   sh scripts/restaurar-documentos.sh actual RUTA            solo una carpeta o archivo, por ejemplo siniestros/123
#   sh scripts/restaurar-documentos.sh AAAA-MM-DD-HHMM RUTA   lo que se borró o reemplazó antes de ese backup
#   Agregar --si para no pedir confirmación.
set -eu
. "$(dirname "$0")/backup-comun.sh"

si=0
origen=""
ruta=""
for arg in "$@"; do
  case $arg in
    --listar)
      en_backup restaurar listar
      exit 0
      ;;
    --si) si=1 ;;
    -h | --help)
      uso
      exit 0
      ;;
    -*)
      echo "Opción desconocida: $arg" >&2
      exit 1
      ;;
    *) if [ -z "$origen" ]; then origen=$arg; else ruta=$arg; fi ;;
  esac
done
if [ -z "$origen" ]; then
  uso
  exit 1
fi

en_backup restaurar documentos "$origen" "$ruta" --prueba
[ "$si" = 1 ] || confirmar SI
en_backup restaurar documentos "$origen" "$ruta"
