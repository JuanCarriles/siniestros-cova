# Funciones de los scripts de backup del host (se carga con ". backup-comun.sh"; no se ejecuta solo).

# Ruta del script que se está corriendo (para mostrar su ayuda) y raíz del repo como directorio de trabajo
SCRIPT="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$0")/.."

# Muestra el comentario inicial del script (su ayuda)
uso() {
  sed -n '2,/^[^#]/p' "$SCRIPT" | sed '$d; s/^# \{0,1\}//'
}

# Corre un comando dentro del servicio "backup": en el contenedor que ya está corriendo (VPS) o, si el servicio no
# está activo (por ejemplo en una PC de desarrollo), en uno de un solo uso.
en_backup() {
  if [ -n "$(docker compose ps --status running -q backup 2> /dev/null)" ]; then
    docker compose exec -T backup "$@"
  else
    comando=$1
    shift
    docker compose --progress quiet run --rm -T --entrypoint "$comando" backup "$@"
  fi
}

# Pide escribir una palabra para confirmar. Sale sin hacer nada si no se escribe exactamente esa palabra.
confirmar() {
  printf '%s' "Escribí $1 para continuar (cualquier otra cosa cancela): "
  respuesta=""
  { read -r respuesta < /dev/tty; } 2> /dev/null || true
  if [ "$respuesta" != "$1" ]; then
    echo "Cancelado."
    exit 1
  fi
}
