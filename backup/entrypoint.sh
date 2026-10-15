#!/bin/sh
# Proceso principal del servicio backup: corre "backup" todos los días a las BACKUP_HORA (hora de Argentina).
# Si falla, reintenta hasta 2 veces con 1 hora de diferencia.
# Al arrancar, si no hubo un backup exitoso en las últimas 24 h (primer arranque, o el VPS estaba apagado a la hora del
# backup), hace uno en el momento.
set -u

HORA=${BACKUP_HORA:-3}
case "$HORA" in
  '' | *[!0-9]*)
    echo "BACKUP_HORA tiene que ser una hora entre 0 y 23" >&2
    exit 1
    ;;
esac
HORA=$(expr "$HORA" + 0)
if [ "$HORA" -gt 23 ]; then
  echo "BACKUP_HORA tiene que ser una hora entre 0 y 23" >&2
  exit 1
fi

# docker stop: salir enseguida aunque esté esperando
trap 'exit 0' TERM INT
esperar() {
  sleep "$1" &
  wait $!
}

con_reintentos() {
  for intento in 1 2 3; do
    backup && return 0
    if [ "$intento" -lt 3 ]; then
      echo "[backup] Falló el intento $intento de 3; se reintenta en 1 hora"
      esperar 3600
    fi
  done
  echo "[backup] Fallaron los 3 intentos; se vuelve a probar a la hora programada"
}

if ! BACKUP_MAX_HORAS=24 estado > /dev/null; then
  echo "[backup] El último backup falló o tiene más de 24 h: se hace uno ahora"
  con_reintentos
fi

while :; do
  ahora=$(date +%s)
  objetivo=$(date -d "$(date +%Y-%m-%d) $HORA:00:00" +%s)
  [ "$objetivo" -gt "$ahora" ] || objetivo=$((objetivo + 86400))
  echo "[backup] Próximo backup: $(date -d "@$objetivo" '+%Y-%m-%d %H:%M')"
  esperar $((objetivo - ahora))
  con_reintentos
done
