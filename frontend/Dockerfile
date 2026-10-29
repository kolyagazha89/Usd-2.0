FROM node:22-alpine AS build

WORKDIR /app
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# package.json runs a build in postinstall, so source and tsconfig must exist first.
COPY . .
RUN npm ci --foreground-scripts --logs-dir=/tmp/usd-npm-logs \
  || { result=$?; tail -n 160 /tmp/usd-npm-logs/*-debug-0.log >&2 || true; exit "$result"; }
RUN npm run build
ARG USD_RELEASE_SHA=development
RUN node -e 'const fs=require("node:fs");const revision=process.env.USD_RELEASE_SHA;if(revision!=="development"&&!/^[a-f0-9]{40}$/.test(revision))process.exit(1);fs.writeFileSync("dist/usd-release.json",JSON.stringify({revision})+"\n")'

FROM nginx:1.27-alpine AS runtime
ARG USD_RELEASE_SHA=development
LABEL org.opencontainers.image.revision=${USD_RELEASE_SHA}
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
