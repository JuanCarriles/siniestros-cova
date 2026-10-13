# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /usr/src/app

# Manifiestos del monorepo (para que npm entienda los workspaces y use el lock)
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci -w backend

# Código fuente
COPY shared/ shared/
COPY backend/ backend/
RUN npm run build -w backend

# Stage 2: Runner
FROM node:22-alpine
WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci -w backend --omit=dev

COPY --from=builder /usr/src/app/backend/dist backend/dist

WORKDIR /usr/src/app/backend

# Usuario sin privilegios que ya trae la imagen de Node
USER node

EXPOSE 3000
# Las variables llegan desde el compose. --enable-source-maps: los errores muestran la línea del .ts original
CMD ["node", "--enable-source-maps", "dist/server.mjs"]
