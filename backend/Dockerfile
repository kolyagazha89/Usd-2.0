FROM node:24-bookworm-slim

WORKDIR /app

# Prisma CLI is used by the guarded startup migration; keep the locked dependency tree.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN DATABASE_URL=postgresql://usd:usd@127.0.0.1:5432/usd?schema=public npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start:prod"]
