# Compilación de la interfaz
FROM node:22-bookworm-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Imagen final: solo el servidor y la interfaz compilada
FROM node:22-bookworm-slim
ENV NODE_ENV=production TZ=Europe/Madrid PORT=9100 DATA_DIR=/data PLUGINS_DIR=/data/plugins
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY shared ./shared
COPY scripts ./scripts
COPY --from=web /app/dist ./dist
RUN mkdir -p /data/plugins && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 9100
# El supervisor arranca la aplicación, la reinicia si hace falta y aplica las actualizaciones.
# Las versiones nuevas se guardan en /data, así que sobreviven a recrear el contenedor.
CMD ["node", "scripts/supervisor.mjs"]
