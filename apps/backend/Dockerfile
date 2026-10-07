FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY . .
RUN npm ci --workspace @legalio/backend --workspace @legalio/system-console --include-workspace-root
RUN npm run build:sys && npm run build:backend && npm prune --omit=dev --workspace @legalio/backend --include-workspace-root

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 APP_DATA_DIR=/data AUTH_DB_PATH=/data/auth.db
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/backend/dist ./apps/backend/dist
COPY --from=build /repo/apps/system-console/dist ./apps/system-console/dist
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
CMD ["node", "apps/backend/dist/server.cjs"]
