FROM node:24-bookworm-slim

WORKDIR /app

# Prisma's native query engine needs OpenSSL on the slim Debian image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Keep the locked dependency tree; database migrations are a separate reviewed operation.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN DATABASE_URL=postgresql://usd:usd@127.0.0.1:5432/usd?schema=public npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main.js"]
