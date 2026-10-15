#!/bin/sh
# Reemplaza la base de datos por un backup de R2 (RNF-05). La base actual NO se borra: queda guardada con otro
# nombre (siniestros_antes_AAAAMMDD_HHMMSS) y se puede volver a ella con --volver-a.
#
# Uso, desde la raíz del repo (en el VPS o en tu PC):
#   sh scripts/restaurar-backup.sh --listar            backups disponibles y bases guardadas
#   sh scripts/restaurar-backup.sh ultimo              restaura el último backup de R2
#   sh scripts/restaurar-backup.sh NOMBRE              restaura uno en particular (siniestros-AAAA-MM-DD-HHMM.dump)
#   sh scripts/restaurar-backup.sh NOMBRE --local      usa la copia guardada en este equipo, sin descargarla de R2
#   sh scripts/restaurar-backup.sh --volver-a BASE     vuelve a una base guardada (por ejemplo la de antes de restaurar)
#   Agregar --si para no pedir confirmación.
#
# Pasos: 1) restaura el backup en una base aparte, mientras el sitio sigue andando con la actual; 2) pide
# confirmación; 3) detiene backend y frontend; 4) cambia la base actual por la restaurada; 5) vuelve a levantar lo que
# estaba corriendo (migrate aplica las migraciones que el backup no tenga). Si algo falla, queda la base de antes.
set -eu
. "$(dirname "$0")/backup-comun.sh"

si=0
local=""
nombre=""
volver=""
while [ $# -gt 0 ]; do
  case $1 in
    --listar)
      en_backup restaurar listar
      exit 0
      ;;
    --si) si=1 ;;
    --local) local=--local ;;
    --volver-a)
      volver=${2:-}
      [ -n "$volver" ] || {
        echo "Falta el nombre de la base: --volver-a BASE (ver --listar)" >&2
        exit 1
      }
      shift
      ;;
    -h | --help)
      uso
      exit 0
      ;;
    -*)
      echo "Opción desconocida: $1" >&2
      exit 1
      ;;
    *) nombre=$1 ;;
  esac
  shift
done
if [ -z "$nombre" ] && [ -z "$volver" ]; then
  uso
  exit 1
fi

if [ -n "$volver" ]; then
  descripcion="la base guardada $volver"
else
  echo "1/4 Restaurando el backup en una base aparte (la actual sigue funcionando)..."
  en_backup restaurar preparar "$nombre" $local
  descripcion="el backup restaurado en el paso 1"
fi

echo
echo "2/4 Se va a reemplazar la base de datos de la app por $descripcion."
echo "    El sitio queda sin servicio unos segundos. La base actual se guarda y se puede volver a ella (--volver-a)."
[ "$si" = 1 ] || confirmar RESTAURAR

# Solo se detiene y se vuelve a levantar lo que estaba corriendo (en una PC de desarrollo puede no haber nada)
corriendo=$(docker compose ps --status running --services 2> /dev/null | grep -xE 'backend|frontend' || true)
levantar() {
  if [ -n "$corriendo" ]; then
    echo "4/4 Levantando $(echo $corriendo) (migrate aplica las migraciones que falten)..."
    docker compose up -d --wait $corriendo
  fi
}
if [ -n "$corriendo" ]; then
  echo "3/4 Deteniendo $(echo $corriendo)..."
  docker compose stop $corriendo
fi
# Pase lo que pase, lo que estaba corriendo vuelve a levantarse (con la base nueva, o con la de antes si falló)
trap levantar EXIT

if [ -n "$volver" ]; then
  en_backup restaurar activar "$volver"
else
  en_backup restaurar activar
fi

if [ -z "$corriendo" ]; then
  echo
  echo "El backend no estaba corriendo en Docker. Si el backup es de antes de la última migración, aplicala con:"
  echo "  npm run prisma:migrate:deploy -w backend"
fi
