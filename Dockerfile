# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts ./artifacts
COPY lib ./lib
COPY scripts ./scripts
COPY tsconfig*.json ./

ARG BASE_PATH=/
ARG VITE_ENABLE_CROWDSTRIKE_LIVE=false
ARG VITE_AUTH_ENABLED=true
ARG VITE_AUTH_PASSWORD_HASH=b659cbe373e4922849b116d4e3b16db70302f1fec8a9d5ef8c349c1ca686fbda
ARG VITE_AUTH_SALT=vuln-command-3b3822234d5ea8f0
ARG VITE_AUTH_SESSION_MINUTES=30
ARG VITE_AUTH_MAX_ATTEMPTS=5
ARG VITE_AUTH_LOCKOUT_MINUTES=10

ENV BASE_PATH=${BASE_PATH}
ENV VITE_ENABLE_CROWDSTRIKE_LIVE=${VITE_ENABLE_CROWDSTRIKE_LIVE}
ENV VITE_AUTH_ENABLED=${VITE_AUTH_ENABLED}
ENV VITE_AUTH_PASSWORD_HASH=${VITE_AUTH_PASSWORD_HASH}
ENV VITE_AUTH_SALT=${VITE_AUTH_SALT}
ENV VITE_AUTH_SESSION_MINUTES=${VITE_AUTH_SESSION_MINUTES}
ENV VITE_AUTH_MAX_ATTEMPTS=${VITE_AUTH_MAX_ATTEMPTS}
ENV VITE_AUTH_LOCKOUT_MINUTES=${VITE_AUTH_LOCKOUT_MINUTES}

RUN pnpm install --frozen-lockfile
RUN pnpm run typecheck
RUN pnpm --filter @workspace/vuln-mgmt build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/artifacts/vuln-mgmt/dist/public /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
