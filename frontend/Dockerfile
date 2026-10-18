FROM node:22-alpine AS build

WORKDIR /app
ARG VITE_API_URL
ARG VITE_AUTH_SESSION_MODE
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_AUTH_SESSION_MODE=${VITE_AUTH_SESSION_MODE}

# package.json runs a build in postinstall, so source and tsconfig must exist first.
COPY . .
RUN npm ci --ignore-scripts
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
