#!/bin/sh
# Restauración de los backups de R2 (RNF-05). Se usa a través de los scripts del host:
#   scripts/probar-restauracion.sh   prueba sin tocar nada: restaura en una base temporal, compara y la borra
#   scripts/restaurar-backup.sh      reemplaza la base por un backup (la actual queda guardada con otro nombre)
#   scripts/restaurar-documentos.sh  devuelve documentos del backup al bucket de la app
#   scripts/probar-backups.sh        verificación completa (backup, restauración de prueba y documentos)
#
# Comandos, dentro del contenedor backup:
#   restaurar listar                              backups de R2 y del VPS, historial de documentos y bases guardadas
#   restaurar probar [NOMBRE|ultimo]              restaura en <base>_prueba, compara con la actual y la borra
#   restaurar preparar NOMBRE|ultimo [--local]    restaura en <base>_restaurada sin tocar la actual
#   restaurar activar [BASE]                      pone BASE (por defecto <base>_restaurada) como la base de la app;
#                                                 la actual queda como <base>_antes_AAAAMMDD_HHMMSS
#   restaurar documentos ORIGEN [RUTA] [--prueba] copia documentos del backup al bucket de la app, sin sobrescribir
#                                                 ni borrar; ORIGEN: actual o una fecha del historial
#   restaurar verificar-documentos                comprueba que cada documento de la app esté en el backup
set -eu
. /usr/local/lib/backup/comun.sh

BASE=${PGDATABASE:-}
PRUEBA="${BASE}_prueba"
RESTAURADA="${BASE}_restaurada"
DESCARGAS="$DIR/restaurar"

# Sin los avisos informativos de Postgres (por ejemplo "database ... does not exist, skipping")
sql() { PGOPTIONS='--client-min-messages=warning' psql -d postgres -v ON_ERROR_STOP=1 -qAt "$@"; }
existe_base() { [ "$(sql -c "SELECT 1 FROM pg_database WHERE datname = '$1'")" = 1 ]; }

# Deja en $DUMP el backup NOMBRE (o el último de R2) descifrado y verificado; el nombre queda en $NOMBRE
descargar() {
  NOMBRE=${1%.bin}
  if [ "$NOMBRE" = ultimo ]; then
    NOMBRE=$(rclone lsf cifrado: --files-only | grep -E '\.dump$' | sort | tail -n 1) || true
    [ -n "$NOMBRE" ] || falla "no hay backups de la base en r2:$BUCKET/$PREFIJO/db/"
  fi
  echo "$NOMBRE" | grep -Eq '^[A-Za-z0-9_-]+-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}\.dump$' ||
    falla "nombre de backup inválido: $NOMBRE (los disponibles: sh scripts/restaurar-backup.sh --listar)"
  mkdir -p "$DESCARGAS"
  DUMP="$DESCARGAS/$NOMBRE"
  if [ "${LOCAL:-0}" = 1 ]; then
    [ -f "$DIR/$NOMBRE" ] || falla "no está la copia local $NOMBRE en este equipo (ver --listar)"
    log "Usando la copia local $NOMBRE (sin descargar de R2)"
    cp "$DIR/$NOMBRE" "$DUMP"
  else
    # rclone no da error al copiar un archivo que no existe: se comprueba antes
    rclone lsf cifrado: --files-only | grep -qxF "$NOMBRE" ||
      falla "no existe el backup $NOMBRE en r2:$BUCKET/$PREFIJO/db/ (ver --listar)"
    log "Descargando y descifrando $NOMBRE desde r2:$BUCKET/$PREFIJO/db/ ..."
    if ! rclone copyto "cifrado:$NOMBRE" "$DUMP" 2> "$DIR/.error"; then
      if grep -q 'bad password' "$DIR/.error"; then
        motivo="la BACKUP_CLAVE no es la misma con la que se hizo este backup"
      else
        motivo=$(grep -oE 'AccessDenied|InvalidAccessKeyId|SignatureDoesNotMatch' "$DIR/.error" | head -n 1) || true
      fi
      rm -f "$DIR/.error" "$DUMP"
      falla "no se pudo descargar $NOMBRE: ${motivo:-error de rclone}"
    fi
    rm -f "$DIR/.error"
  fi
  pg_restore --list "$DUMP" > /dev/null || falla "el archivo $NOMBRE está dañado"
}

# Crea la base $1 desde cero y restaura $DUMP en ella. Todo o nada: si algo falla, se borra la base a medio hacer.
restaurar_en() {
  sql -c "DROP DATABASE IF EXISTS \"$1\" WITH (FORCE)" -c "CREATE DATABASE \"$1\""
  if ! pg_restore --dbname="$1" --no-owner --no-acl --single-transaction --exit-on-error "$DUMP"; then
    sql -c "DROP DATABASE IF EXISTS \"$1\" WITH (FORCE)"
    falla "no se pudo restaurar $NOMBRE"
  fi
}

# Filas por tabla de la base $1 ("tabla cantidad", una por línea)
contar() {
  psql -d "$1" -qAtF ' ' -c "
    SELECT table_name,
           (xpath('/row/c/text()',
                  query_to_xml(format('SELECT count(*) AS c FROM public.%I', table_name), false, true, '')))[1]::text
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY 1"
}

# Tabla comparativa de filas entre el backup restaurado ($1) y la base actual ($2)
comparar() {
  contar "$1" > "$DESCARGAS/.backup"
  if existe_base "$2"; then contar "$2" > "$DESCARGAS/.actual"; else : > "$DESCARGAS/.actual"; fi
  printf '    %-28s %10s %10s\n' Tabla Backup Actual
  awk 'NR == FNR { b[$1] = $2; t[$1] = 1; next } { a[$1] = $2; t[$1] = 1 }
       END { for (k in t) printf "    %-28s %10s %10s\n", k, (k in b) ? b[k] : "(no está)", (k in a) ? a[k] : "(no está)" }' \
    "$DESCARGAS/.backup" "$DESCARGAS/.actual" | sort
  rm -f "$DESCARGAS/.backup" "$DESCARGAS/.actual"
}

cmd_listar() {
  log "Backups de la base en R2 (r2:$BUCKET/$PREFIJO/db/), del más nuevo al más viejo:"
  rclone lsl cifrado: | awk '{ printf "    %-40s %10.1f KB\n", $4, $1 / 1024 }' | sort -r
  log "Copias locales en este equipo:"
  (cd "$DIR" && ls -1 -- *.dump 2> /dev/null | sort -r | sed 's/^/    /') || echo "    (ninguna)"
  log "Documentos: orígenes para restaurar-documentos:"
  echo "    actual  (la copia del último backup)"
  rclone lsf "$DESTINO_DOCUMENTOS/historial" --dirs-only 2> /dev/null | sed 's|/$||; s/^/    /' | sort -r || true
  log "Bases guardadas de restauraciones anteriores (para --volver-a):"
  sql -c "SELECT datname FROM pg_database WHERE datname LIKE '${BASE}\_%' ORDER BY 1" | sed 's/^/    /'
}

cmd_probar() {
  tomar_lock
  descargar "${1:-ultimo}"
  # Pase lo que pase, la base temporal y el archivo descargado se borran al terminar
  trap 'sql -c "DROP DATABASE IF EXISTS \"$PRUEBA\" WITH (FORCE)" > /dev/null 2>&1; rm -f "$DUMP"' EXIT
  log "Restaurando $NOMBRE en la base temporal $PRUEBA ..."
  restaurar_en "$PRUEBA"
  tablas=$(contar "$PRUEBA" | wc -l)
  [ "$tablas" -gt 0 ] || falla "el backup restaurado no tiene tablas"
  migraciones=$(psql -d "$PRUEBA" -qAt -c \
    'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL' 2> /dev/null) ||
    falla "el backup restaurado no tiene la tabla de migraciones de Prisma"
  log "Filas por tabla. Las diferencias son normales: es lo que cambió en la base desde que se hizo el backup."
  comparar "$PRUEBA" "$BASE"
  echo "$(date +%s) $NOMBRE" > "$DIR/.ultima-prueba-ok"
  log "Restauración de prueba correcta: $NOMBRE ($tablas tablas, $migraciones migraciones aplicadas)."
  log "La base temporal $PRUEBA se borra; la base $BASE no se tocó."
}

cmd_preparar() {
  nombre=""
  for arg in "$@"; do
    case $arg in
      --local) LOCAL=1 ;;
      *) nombre=$arg ;;
    esac
  done
  [ -n "$nombre" ] || falla "uso: restaurar preparar NOMBRE|ultimo [--local]"
  tomar_lock
  descargar "$nombre"
  trap 'rm -f "$DUMP"' EXIT
  log "Restaurando $NOMBRE en la base $RESTAURADA (la base $BASE sigue funcionando sin cambios)..."
  restaurar_en "$RESTAURADA"
  log "Filas por tabla:"
  comparar "$RESTAURADA" "$BASE"
  log "Backup restaurado en $RESTAURADA, listo para activar."
}

cmd_activar() {
  origen=${1:-$RESTAURADA}
  [ "$origen" != "$BASE" ] || falla "$origen ya es la base de la app"
  tomar_lock
  existe_base "$origen" || falla "no existe la base $origen (ver --listar)"
  anterior="${BASE}_antes_$(date +%Y%m%d_%H%M%S)"
  log "Poniendo $origen como base de la app; la actual queda guardada como $anterior ..."
  # Corta las conexiones que queden (por ejemplo un backend de desarrollo con npm run dev) y renombra las dos bases en
  # una sola transacción: o cambian las dos o ninguna. Si alguien se reconecta justo en el medio, reintenta.
  for intento in 1 2 3 4 5; do
    sql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
            WHERE datname IN ('$BASE', '$origen') AND pid <> pg_backend_pid()" > /dev/null
    if sql -1 -c "ALTER DATABASE \"$BASE\" RENAME TO \"$anterior\"" \
      -c "ALTER DATABASE \"$origen\" RENAME TO \"$BASE\"" 2> "$DIR/.error"; then
      rm -f "$DIR/.error"
      log "Listo: la base $BASE es ahora $origen. La anterior quedó como $anterior."
      return 0
    fi
    sleep 1
  done
  cat "$DIR/.error" >&2
  rm -f "$DIR/.error"
  falla "no se pudo cambiar la base (sigue la de antes, sin cambios)"
}

cmd_documentos() {
  origen=""
  ruta=""
  prueba=""
  for arg in "$@"; do
    case $arg in
      --prueba) prueba=--dry-run ;;
      *) if [ -z "$origen" ]; then origen=$arg; else ruta=$arg; fi ;;
    esac
  done
  [ -n "$BUCKET_DOCUMENTOS" ] || falla "falta R2_BUCKET en backend/.env"
  case "$origen" in
    actual) desde="$DESTINO_DOCUMENTOS/actual" ;;
    [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-[0-9][0-9][0-9][0-9]) desde="$DESTINO_DOCUMENTOS/historial/$origen" ;;
    *) falla "uso: restaurar documentos actual|AAAA-MM-DD-HHMM [RUTA] [--prueba] (orígenes: --listar)" ;;
  esac
  ruta=${ruta#/}
  ruta=${ruta%/}
  case "$ruta" in *..* | *\\*) falla "ruta inválida: $ruta" ;; esac
  hacia="docs:$BUCKET_DOCUMENTOS"
  if [ -n "$ruta" ]; then
    desde="$desde/$ruta"
    hacia="$hacia/$ruta"
  fi
  tomar_lock
  # Un archivo suelto se copia con copyto; una carpeta, con copy
  # En R2 las carpetas no existen como tales: una ruta sin archivos adentro es una ruta que no está en el backup
  comando=copy
  if rclone lsjson --stat "$desde" 2> /dev/null | grep -qE '"IsDir": *false'; then
    comando=copyto
  elif [ -z "$(rclone lsf "$desde" -R --files-only 2> /dev/null | head -n 1)" ]; then
    falla "no hay documentos en el backup en ${desde#r2:} (orígenes: --listar)"
  fi
  if [ -n "$prueba" ]; then
    log "PRUEBA (no se copia nada): qué se copiaría de $desde a $hacia"
  else
    log "Copiando de $desde a $hacia (sin sobrescribir ni borrar lo que ya existe)..."
  fi
  codigo=0
  rclone "$comando" "$desde" "$hacia" --ignore-existing $COPIA_INTERNA $prueba -v > "$DIR/.salida" 2>&1 ||
    codigo=$?
  grep -E ': (Copied|Skipped copy)|ERROR' "$DIR/.salida" | sed -E 's/^[0-9/]+ [0-9:]+ //; s/^/    /' || true
  cantidad=$(grep -cE ': (Copied|Skipped copy)' "$DIR/.salida") || true
  rm -f "$DIR/.salida"
  [ "$codigo" -eq 0 ] || falla "no se pudieron copiar los documentos (código $codigo de rclone)"
  if [ -n "$prueba" ]; then
    log "Se copiarían $cantidad archivo(s). Los que ya existen en $BUCKET_DOCUMENTOS no se tocan."
  else
    log "$cantidad archivo(s) restaurado(s) en $BUCKET_DOCUMENTOS."
  fi
}

cmd_verificar_documentos() {
  [ -n "$BUCKET_DOCUMENTOS" ] || {
    log "Sin R2_BUCKET: no hay documentos que verificar"
    return 0
  }
  problemas=0
  for carpeta in $CARPETAS; do
    if ! carpeta_con_documentos "$carpeta"; then
      log "    $carpeta/: vacía"
      continue
    fi
    # Compara contenido (suma MD5) de cada documento de la app con su copia en el backup
    rm -f "$DIR/.check"
    rclone check "docs:$BUCKET_DOCUMENTOS/$carpeta" "$DESTINO_DOCUMENTOS/actual/$carpeta" --one-way \
      --combined "$DIR/.check" > "$DIR/.error" 2>&1 || true
    # La carpeta tiene documentos: si la comparación no listó ninguno, no se pudo comparar (no es "todo bien")
    if [ ! -s "$DIR/.check" ]; then
      grep -E 'ERROR|CRITICAL' "$DIR/.error" | head -n 3 >&2 || true
      rm -f "$DIR/.error"
      falla "no se pudo comparar $carpeta/ con el backup"
    fi
    rm -f "$DIR/.error"
    total=$(grep -c . "$DIR/.check") || true
    iguales=$(grep -c '^= ' "$DIR/.check") || true
    log "    $carpeta/: $iguales de $total documentos están en el backup"
    grep -v '^= ' "$DIR/.check" | head -n 20 |
      sed 's/^+ /      falta: /; s/^\* /      distinto: /; s/^! /      error: /' || true
    problemas=$((problemas + total - iguales))
  done
  rm -f "$DIR/.check"
  [ "$problemas" -eq 0 ] ||
    falla "$problemas documento(s) no están en el backup o no coinciden. Si se subieron después del último backup es normal: se copian en el próximo."
  log "Todos los documentos están en el backup"
}

comando=${1:-}
[ $# -eq 0 ] || shift
case "$comando" in
  listar | probar | preparar | activar | documentos | verificar-documentos) ;;
  *)
    sed -n '2,19p' "$0"
    exit 1
    ;;
esac
[ -n "$BASE" ] || falla "falta PGDATABASE (el compose la toma de POSTGRES_DB)"
configurar_r2
case "$comando" in
  listar) cmd_listar ;;
  probar) cmd_probar "$@" ;;
  preparar) cmd_preparar "$@" ;;
  activar) cmd_activar "$@" ;;
  documentos) cmd_documentos "$@" ;;
  verificar-documentos) cmd_verificar_documentos ;;
esac
