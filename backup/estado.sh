#!/bin/sh
# Estado de los backups. Lo usa el healthcheck del servicio y se puede correr a mano:
#   docker compose exec backup estado
# Sale con error ("unhealthy") si nunca hubo un backup exitoso, si el último intento falló o si el último backup
# exitoso tiene más de BACKUP_MAX_HORAS (26 por defecto: el diario más un margen).
MAX_HORAS=${BACKUP_MAX_HORAS:-26}
OK=/backups/.ultimo-ok
ERROR=/backups/.ultimo-error

if [ ! -f "$OK" ]; then
  echo "Todavía no hay ningún backup exitoso. Ver: docker compose logs backup"
  exit 1
fi

read -r cuando nombre < "$OK"
horas=$((($(date +%s) - cuando) / 3600))
echo "Último backup exitoso: $nombre, hace $horas h ($(date -d "@$cuando" '+%Y-%m-%d %H:%M'))"

# Informativo (no cambia el resultado): última restauración de prueba correcta (RNF-05)
if [ -f /backups/.ultima-prueba-ok ]; then
  read -r cuando_prueba nombre_prueba < /backups/.ultima-prueba-ok
  echo "Última restauración de prueba correcta: $nombre_prueba ($(date -d "@$cuando_prueba" '+%Y-%m-%d %H:%M'))"
else
  echo "Todavía no se probó restaurar un backup: sh scripts/probar-restauracion.sh"
fi

if [ -f "$ERROR" ]; then
  read -r cuando_error fecha_error < "$ERROR"
  if [ "$cuando_error" -gt "$cuando" ]; then
    echo "El último intento ($fecha_error) falló. Ver: docker compose logs backup"
    exit 1
  fi
fi

if [ "$horas" -ge "$MAX_HORAS" ]; then
  echo "Hace más de $MAX_HORAS h que no hay un backup exitoso. Ver: docker compose logs backup"
  exit 1
fi
