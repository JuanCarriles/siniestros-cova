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

# default.conf reemplaza al server de ejemplo de la imagen (el nginx.conf principal queda intacto)
COPY frontend/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY frontend/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf

EXPOSE 80
