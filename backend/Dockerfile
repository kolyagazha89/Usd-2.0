FROM node:24-bookworm-slim

WORKDIR /app

# Prisma's native query engine needs OpenSSL on the slim Debian image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Keep the locked dependency tree; database migrations are a separate reviewed operation.
COPY package.json package-lock.json ./
# Failed BuildKit layers are discarded; emit npm's debug context before exit.
# These options run INSIDE the build, independent of systemd's environment.
RUN npm ci --foreground-scripts --logs-dir=/tmp/usd-npm-logs \
  || { result=$?; tail -n 160 /tmp/usd-npm-logs/*-debug-0.log >&2 || true; exit "$result"; }

COPY . .
RUN DATABASE_URL=postgresql://usd:usd@127.0.0.1:5432/usd?schema=public npm run build
ARG USD_RELEASE_SHA=development
RUN node -e 'const fs=require("node:fs");const revision=process.env.USD_RELEASE_SHA;if(revision!=="development"&&!/^[a-f0-9]{40}$/.test(revision))process.exit(1);fs.writeFileSync("usd-release.json",JSON.stringify({revision})+"\n")'
LABEL org.opencontainers.image.revision=${USD_RELEASE_SHA}

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main.js"]
