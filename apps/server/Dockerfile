FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/croc-engine/package.json packages/croc-engine/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/desktop/package.json apps/desktop/package.json
# Dependencies ship prebuilt native modules; do not rebuild them with node-gyp.
RUN npm ci --ignore-scripts
COPY tsconfig*.json ./
COPY packages/shared packages/shared
COPY packages/croc-engine packages/croc-engine
COPY apps/server apps/server
RUN npm run build -w @croc-classroom/shared && npm run build -w @croc-classroom/croc-engine && npm run build -w @croc-classroom/server
RUN test "$(node -p process.arch)" = x64 && node packages/croc-engine/scripts/download.mjs linux-x64

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/croc-engine/package.json packages/croc-engine/package.json
COPY --from=build /app/apps/server/package.json apps/server/package.json
COPY --from=build /app/apps/desktop/package.json apps/desktop/package.json
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/croc-engine/dist packages/croc-engine/dist
COPY --from=build /app/packages/croc-engine/bin/linux-x64/croc /usr/local/bin/croc
COPY --from=build /app/apps/server/dist apps/server/dist
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]
