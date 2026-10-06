FROM node:22-bookworm-slim
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev
COPY tmp/db-inspect.mjs ./tmp/db-inspect.mjs
CMD ["node","tmp/db-inspect.mjs"]