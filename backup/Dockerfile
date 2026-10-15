# Backups diarios de la base y de los documentos a Cloudflare R2 (ver backup/backup.sh) y su restauración
# (backup/restaurar.sh). Parte de la imagen de Postgres para tener pg_dump y pg_restore de la MISMA versión que la
# base (17).
FROM postgres:17-alpine

# rclone: sube a R2 (compatible S3), cifra los dumps y copia los documentos.
# tzdata: el horario del backup se calcula en hora de Argentina.
RUN apk add --no-cache rclone tzdata

ENV TZ=America/Argentina/Buenos_Aires

COPY comun.sh /usr/local/lib/backup/
COPY backup.sh restaurar.sh entrypoint.sh estado.sh /usr/local/bin/
# Si los scripts llegan desde Windows con finales de línea CRLF o sin permiso de ejecución, no correrían.
# Se instalan sin la extensión para usarlos como comandos: backup, restaurar, estado.
RUN cd /usr/local/bin \
  && sed -i 's/\r$//' backup.sh restaurar.sh entrypoint.sh estado.sh /usr/local/lib/backup/comun.sh \
  && mv backup.sh backup && mv restaurar.sh restaurar && mv estado.sh estado \
  && mv entrypoint.sh backup-entrypoint \
  && chmod +x backup restaurar estado backup-entrypoint

ENTRYPOINT ["backup-entrypoint"]
