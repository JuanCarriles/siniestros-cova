# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# Manifiestos del monorepo (para que npm entienda los workspaces y use el lock)
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY frontend/package.json frontend/

RUN npm ci -w frontend 

# Código fuente
COPY shared/ shared/
COPY frontend/ frontend/
RUN npm run build -w frontend


# Stage 2: runner 
FROM nginx:alpine

# Con workspaces el build queda dentro de frontend/
COPY --from=builder /usr/src/app/frontend/dist /usr/share/nginx/html

# Configuración de Nginx: piezas comunes, las dos variantes de server (HTTP / HTTPS) y el script que
# elige una al arrancar y la escribe en conf.d/default.conf (reemplaza al server de ejemplo de la imagen).
COPY frontend/nginx/snippets/ /etc/nginx/snippets/
COPY frontend/nginx/http.conf frontend/nginx/https.conf /etc/nginx/plantillas/
COPY frontend/nginx/40-elegir-config.sh /docker-entrypoint.d/40-elegir-config.sh
# Si el script llega desde Windows con finales de línea CRLF o sin permiso de ejecución, no correría
RUN sed -i 's/\r$//' /docker-entrypoint.d/40-elegir-config.sh && chmod +x /docker-entrypoint.d/40-elegir-config.sh

EXPOSE 80 443
