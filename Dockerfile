FROM node:22-bookworm-slim
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev
COPY backend/data/historical-xlsx.json ./backend/data/historical-xlsx.json
COPY tmp/db-inspect.mjs ./backend/tmp/db-inspect.mjs
WORKDIR /app/backend
CMD ["node", "tmp/db-inspect.mjs"]
