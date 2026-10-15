# Funciones y configuración que comparten "backup" y "restaurar" (se carga con ". comun.sh"; no se ejecuta solo).
#
# Variables: conexión a la base (PGHOST, PGUSER, PGPASSWORD, PGDATABASE, las pone el compose), R2_* del backend y
# BACKUP_* (ver .env.example). Nunca se imprimen las credenciales ni la clave.
#
# Tokens: los documentos se leen (y se restauran) con el token del backend (R2_*) y los backups se escriben con el
# de backups (BACKUP_R2_*). Así ninguno de los dos necesita acceso al bucket del otro: si el token de la app se
# filtra, no alcanza para borrar los backups. Sin token de backups se usa el del backend para todo.

DIR=/backups
log() { echo "[backup $(date '+%Y-%m-%d %H:%M:%S')] $*"; }
falla() {
  log "ERROR: $*" >&2
  exit 1
}

mkdir -p "$DIR"

# Un solo backup o restauración a la vez (el backup programado y uno manual podrían coincidir)
tomar_lock() {
  exec 9> "$DIR/.lock"
  flock -n 9 || falla "ya hay un backup o una restauración en curso; probá de nuevo en unos minutos"
}

# Valida la configuración y define los destinos de rclone (por variables de entorno, sin archivo de configuración):
#   r2:       R2 con el token de backups (los backups)
#   docs:     R2 con el token del backend (los documentos de la app)
#   cifrado:  <bucket>/<prefijo>/db sobre r2:, cifrando el contenido (los nombres quedan legibles, con extensión .bin)
configurar_r2() {
  DOCS_ACCESS_KEY=${R2_ACCESS_KEY_ID:-}
  DOCS_SECRET_KEY=${R2_SECRET_ACCESS_KEY:-}
  ACCESS_KEY=${BACKUP_R2_ACCESS_KEY_ID:-$DOCS_ACCESS_KEY}
  SECRET_KEY=${BACKUP_R2_SECRET_ACCESS_KEY:-$DOCS_SECRET_KEY}
  ACCOUNT_ID=${R2_ACCOUNT_ID:-}
  ENDPOINT=${R2_ENDPOINT:-}
  BUCKET_DOCUMENTOS=${R2_BUCKET:-}
  BUCKET=${BACKUP_BUCKET:-$BUCKET_DOCUMENTOS}
  PREFIJO=${BACKUP_PREFIX:-backups}
  CARPETAS=${BACKUP_CARPETAS_DOCUMENTOS:-siniestros plantillas}
  CLAVE=${BACKUP_CLAVE:-}

  [ -n "$ACCOUNT_ID" ] || [ -n "$ENDPOINT" ] || falla "falta R2_ACCOUNT_ID en backend/.env"
  [ -n "$ACCESS_KEY" ] && [ -n "$SECRET_KEY" ] ||
    falla "faltan las claves de R2: R2_ACCESS_KEY_ID y R2_SECRET_ACCESS_KEY (o BACKUP_R2_*)"
  [ -z "$BUCKET_DOCUMENTOS" ] || { [ -n "$DOCS_ACCESS_KEY" ] && [ -n "$DOCS_SECRET_KEY" ]; } ||
    falla "faltan R2_ACCESS_KEY_ID y R2_SECRET_ACCESS_KEY en backend/.env (para leer los documentos)"
  [ -n "$BUCKET" ] || falla "falta BACKUP_BUCKET (o R2_BUCKET en backend/.env)"
  [ -n "$CLAVE" ] || falla "falta BACKUP_CLAVE: sin ella los backups se subirían sin cifrar"
  # Una sola carpeta, y distinta de las de documentos: si no, la copia de documentos se copiaría a sí misma
  case "$PREFIJO" in
    '' | *[!a-z0-9-]*) falla "BACKUP_PREFIX tiene que ser un nombre simple (minúsculas, números y guiones)" ;;
  esac
  for carpeta in $CARPETAS; do
    [ "$carpeta" != "$PREFIJO" ] || falla "BACKUP_PREFIX no puede ser una carpeta de documentos ($carpeta)"
  done

  ENDPOINT=${ENDPOINT:-https://$ACCOUNT_ID.r2.cloudflarestorage.com}
  for remoto in R2 DOCS; do
    export "RCLONE_CONFIG_${remoto}_TYPE=s3"
    export "RCLONE_CONFIG_${remoto}_PROVIDER=Cloudflare"
    export "RCLONE_CONFIG_${remoto}_ENDPOINT=$ENDPOINT"
    export "RCLONE_CONFIG_${remoto}_REGION=auto"
    # Los tokens no tienen por qué poder crear buckets: no intentar crearlos
    export "RCLONE_CONFIG_${remoto}_NO_CHECK_BUCKET=true"
  done
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$ACCESS_KEY"
  export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$SECRET_KEY"
  export RCLONE_CONFIG_DOCS_ACCESS_KEY_ID="$DOCS_ACCESS_KEY"
  export RCLONE_CONFIG_DOCS_SECRET_ACCESS_KEY="$DOCS_SECRET_KEY"
  export RCLONE_CONFIG_CIFRADO_TYPE=crypt
  export RCLONE_CONFIG_CIFRADO_REMOTE="r2:$BUCKET/$PREFIJO/db"
  export RCLONE_CONFIG_CIFRADO_FILENAME_ENCRYPTION=off
  export RCLONE_CONFIG_CIFRADO_DIRECTORY_NAME_ENCRYPTION=false
  # Por stdin para que la clave no aparezca en la lista de procesos
  RCLONE_CONFIG_CIFRADO_PASSWORD=$(printf '%s' "$CLAVE" | rclone obscure -)
  export RCLONE_CONFIG_CIFRADO_PASSWORD
  export RCLONE_RETRIES=3
  # Sin archivo de configuración (todo va por variables): evita el aviso "Config file not found" en cada comando
  export RCLONE_CONFIG=/dev/null

  # Con el mismo token para leer documentos y escribir backups, R2 copia los archivos internamente
  COPIA_INTERNA=""
  [ "$ACCESS_KEY" != "$DOCS_ACCESS_KEY" ] || COPIA_INTERNA="--server-side-across-configs"
  DESTINO_DOCUMENTOS="r2:$BUCKET/$PREFIJO/documentos"
}

# Lee una carpeta de documentos de la app. Devuelve 0 si tiene archivos, 1 si está vacía o no existe todavía, y
# corta con el motivo si no se puede leer (por ejemplo, el token no tiene permiso).
carpeta_con_documentos() {
  codigo=0
  hay=$(rclone lsf "docs:$BUCKET_DOCUMENTOS/$1" --max-depth 1 --low-level-retries 2 2> "$DIR/.error") || codigo=$?
  # Código 3 de rclone: directorio no encontrado (la carpeta todavía no existe)
  if [ "$codigo" -eq 3 ] || { [ "$codigo" -eq 0 ] && [ -z "$hay" ]; }; then
    rm -f "$DIR/.error"
    return 1
  fi
  if [ "$codigo" -ne 0 ]; then
    motivo=$(grep -oE 'AccessDenied|NoSuchBucket|InvalidAccessKeyId|SignatureDoesNotMatch|RequestTimeTooSkewed' \
      "$DIR/.error" | head -n 1)
    rm -f "$DIR/.error"
    falla "no se pudo leer $BUCKET_DOCUMENTOS/$1 con el token del backend (${motivo:-código $codigo de rclone})"
  fi
  rm -f "$DIR/.error"
  return 0
}
