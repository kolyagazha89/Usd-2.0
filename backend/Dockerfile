# Compile with the complete pinned toolchain, but never publish that
# toolchain (Nest CLI, Jest, TypeScript, nested vulnerable dev packages) in
# the service image.
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --foreground-scripts --logs-dir=/tmp/usd-npm-logs \
  || { result=$?; tail -n 160 /tmp/usd-npm-logs/*-debug-0.log >&2 || true; exit "$result"; }
COPY . .
RUN DATABASE_URL=postgresql://usd:usd@127.0.0.1:5432/usd?schema=public npm run build

# Existing supervised Ubuntu schema-migration scripts run
# `docker run --entrypoint npx <api-image> prisma migrate deploy`.
# Keep precisely the *pinned Prisma CLI and its runtime graph* as production
# dependencies inside the image, without exposing the rest of devDependencies.
# Root manifest is adjusted INSIDE the Docker builder only (not in Git), then
# npm prune recalculates the runtime graph from the committed lockfile.
RUN node -e 'const fs=require("node:fs");const pkg=JSON.parse(fs.readFileSync("package.json","utf8"));const lock=JSON.parse(fs.readFileSync("package-lock.json","utf8"));const version=pkg.devDependencies.prisma;if(!version||!lock.packages[""].devDependencies.prisma)throw Error("Prisma CLI pin missing");pkg.dependencies.prisma=version;delete pkg.devDependencies.prisma;lock.packages[""].dependencies.prisma=version;delete lock.packages[""].devDependencies.prisma;fs.writeFileSync("package.json",JSON.stringify(pkg)+"\n");fs.writeFileSync("package-lock.json",JSON.stringify(lock)+"\n")'
RUN npm prune --omit=dev --no-fund --no-audit \
  && test -x node_modules/.bin/prisma \
  && ./node_modules/.bin/prisma --version \
  && node -e 'require.resolve("@prisma/client")' \
  && npm audit --omit=dev --audit-level=high
ARG USD_RELEASE_SHA=development
RUN node -e 'const fs=require("node:fs");const revision=process.env.USD_RELEASE_SHA;if(revision!=="development"&&!/^[a-f0-9]{40}$/.test(revision))process.exit(1);fs.writeFileSync("usd-release.json",JSON.stringify({revision})+"\n")'

# The published image has no build toolchain, no root process, and retains the
# CLI only because the reviewed migration/recovery path requires it.
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app /app
ARG USD_RELEASE_SHA=development
LABEL org.opencontainers.image.revision=${USD_RELEASE_SHA}
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
