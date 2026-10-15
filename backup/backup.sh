#!/bin/sh
# Backup de la base de datos y de los documentos a Cloudflare R2 (RNF-04).
# Lo corre el servicio "backup" del compose todos los días (ver entrypoint.sh), y a mano con:
#   sh scripts/backup-ahora.sh
#
# Qué hace, en orden. Si un paso falla se detiene ahí: nunca borra backups viejos después de un error.
#   1. pg_dump de la base (formato custom, comprimido) y verificación del archivo con pg_restore --list
#   2. sube el dump CIFRADO a R2:              <bucket>/<prefijo>/db/<base>-AAAA-MM-DD-HHMM.dump.bin
#      y verifica que lo subido coincida con el archivo local
#   3. copia los documentos nuevos o modificados a <prefijo>/documentos/actual/;
#      lo que se borró o reemplazó desde el backup anterior queda en <prefijo>/documentos/historial/<fecha>/
#   4. borra de R2 lo que tenga más de BACKUP_RETENCION_DIAS y del VPS lo que tenga más de BACKUP_LOCAL_DIAS
#   5. anota el backup exitoso (lo lee "estado", que usa el healthcheck)
#
# Configuración y tokens: ver comun.sh. Para restaurar: restaurar.sh.
set -eu
. /usr/local/lib/backup/comun.sh

tomar_lock

FECHA=$(date +%Y-%m-%d-%H%M)
EN_CURSO="$DIR/.en-curso.dump"
# Si algo falla (también la configuración): se borra el dump a medio hacer y se anota el error, así el healthcheck
# pasa a "unhealthy"
trap 'codigo=$?; rm -f "$EN_CURSO"; [ "$codigo" -eq 0 ] || echo "$(date +%s) $FECHA" > "$DIR/.ultimo-error"' EXIT

configurar_r2
RETENCION=${BACKUP_RETENCION_DIAS:-30}
LOCAL_DIAS=${BACKUP_LOCAL_DIAS:-7}
case "$RETENCION-$LOCAL_DIAS" in
  *[!0-9-]* | -* | *-) falla "BACKUP_RETENCION_DIAS y BACKUP_LOCAL_DIAS tienen que ser números de días" ;;
esac
[ "$RETENCION" -ge 7 ] || falla "BACKUP_RETENCION_DIAS tiene que ser de 7 días o más (RNF-04 pide 30)"
[ "$LOCAL_DIAS" -ge 1 ] || falla "BACKUP_LOCAL_DIAS tiene que ser de 1 día o más"

NOMBRE="$PGDATABASE-$FECHA.dump"

# --- 1. Base de datos ------------------------------------------------------------------------------------------
log "1/5 Volcando la base $PGDATABASE..."
pg_dump --format=custom --file="$EN_CURSO"
pg_restore --list "$EN_CURSO" > /dev/null || falla "el dump generado está dañado; no se sube"
mv "$EN_CURSO" "$DIR/$NOMBRE"
log "    $NOMBRE ($(du -h "$DIR/$NOMBRE" | cut -f1))"

# --- 2. Subida cifrada -----------------------------------------------------------------------------------------
log "2/5 Subiendo el dump cifrado a r2:$BUCKET/$PREFIJO/db/ ..."
rclone copyto "$DIR/$NOMBRE" "cifrado:$NOMBRE"
# Compara el archivo local con lo subido (descifrando la suma de control, sin descargarlo)
rclone cryptcheck "$DIR" cifrado: --one-way --include "/$NOMBRE" ||
  falla "el dump subido no coincide con el local"

# --- 3. Documentos ---------------------------------------------------------------------------------------------
if [ -z "$BUCKET_DOCUMENTOS" ]; then
  log "3/5 Documentos: sin R2_BUCKET, se saltea"
else
  log "3/5 Copiando documentos de $BUCKET_DOCUMENTOS a $DESTINO_DOCUMENTOS/ ..."
  for carpeta in $CARPETAS; do
    if ! carpeta_con_documentos "$carpeta"; then
      log "    $carpeta/: vacía"
      continue
    fi
    # Solo pasa por el VPS lo nuevo o modificado desde el backup anterior (las descargas de R2 no se cobran)
    rclone sync "docs:$BUCKET_DOCUMENTOS/$carpeta" "$DESTINO_DOCUMENTOS/actual/$carpeta" \
      --backup-dir "$DESTINO_DOCUMENTOS/historial/$FECHA/$carpeta" $COPIA_INTERNA
    log "    $carpeta/: copiada"
  done
fi

# --- 4. Retención ----------------------------------------------------------------------------------------------
log "4/5 Borrando backups de más de $RETENCION días en R2 y de más de $LOCAL_DIAS en el VPS..."
rclone delete cifrado: --min-age "${RETENCION}d"
# El historial de documentos se borra por la fecha del nombre de la carpeta: la fecha de cada archivo es la de cuando
# se subió el documento original, no la de cuando se borró.
limite=$(date -d "@$(($(date +%s) - RETENCION * 86400))" +%Y%m%d)
codigo=0
historial=$(rclone lsf "$DESTINO_DOCUMENTOS/historial" --dirs-only 2> /dev/null) || codigo=$?
[ "$codigo" -eq 0 ] || [ "$codigo" -eq 3 ] || falla "no se pudo leer el historial de documentos"
for carpeta in $historial; do
  dia=$(echo "$carpeta" | cut -c1-10 | tr -d '-')
  case "$dia" in *[!0-9]* | '') continue ;; esac
  if [ "${#dia}" -eq 8 ] && [ "$dia" -lt "$limite" ]; then
    rclone purge "$DESTINO_DOCUMENTOS/historial/$carpeta"
    log "    historial/$carpeta borrado"
  fi
done
find "$DIR" -maxdepth 1 -name '*.dump' -type f -mtime +"$LOCAL_DIAS" -print -delete

# --- 5. Listo --------------------------------------------------------------------------------------------------
echo "$(date +%s) $NOMBRE" > "$DIR/.ultimo-ok"
rm -f "$DIR/.ultimo-error"
log "5/5 Backup completo: $NOMBRE"
