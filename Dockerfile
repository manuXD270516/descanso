# Etapa 1: compilar el frontend Angular
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npx ng build

# Etapa 2: dependencias de producción del backend (capa cacheable)
# better-sqlite3 trae binario precompilado para linuxmusl-x64: no hace falta toolchain
FROM node:22-alpine AS backend-deps
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Etapa 3: imagen final (backend + estáticos)
FROM node:22-alpine
WORKDIR /app/backend
COPY --from=backend-deps /app/backend/node_modules ./node_modules
COPY backend/package.json ./
COPY backend/src ./src
COPY --from=frontend /app/frontend/dist/frontend/browser /app/frontend/dist/frontend/browser
ENV PORT=3000 DB_PATH=/data/sleep.db NODE_ENV=production
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
# Al final para no invalidar la caché de las capas anteriores
ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION
CMD ["node", "src/server.js"]
