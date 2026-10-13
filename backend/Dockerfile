FROM node:24-bookworm-slim

WORKDIR /app

# Prisma CLI is used by the guarded startup migration; keep the locked dependency tree.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start:prod"]
