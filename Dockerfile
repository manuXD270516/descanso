# Etapa 1: compilar el frontend Angular
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npx ng build

# Etapa 2: backend + estáticos
FROM node:22-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=frontend /app/frontend/dist/frontend/browser /app/frontend/dist/frontend/browser
ENV PORT=3000 DB_PATH=/data/sleep.db NODE_ENV=production
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "src/server.js"]
