# syntax=docker/dockerfile:1
#
# Build context: /home/YOUR_USERNAME/nas_portal
#   docker build -t nas-portal /home/YOUR_USERNAME/nas_portal
#
# The SPA build is expected at web/dist inside the build context. Docker cannot
# conditionally COPY, so ensure the directory exists before building (an empty
# directory is fine — the server then returns JSON 404 for non-/api routes):
#   mkdir -p /home/YOUR_USERNAME/nas_portal/web/dist && docker build -t nas-portal /home/YOUR_USERNAME/nas_portal
#
# At runtime DATA_DIR (/srv/fortress/data by default) should be a volume owned
# by uid 1000 (the `node` user), e.g. chown -R 1000:1000 /srv/fortress/data.

FROM node:22-alpine

ENV NODE_ENV=production

# Install production dependencies first for better layer caching.
WORKDIR /app
COPY --chown=node:node server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Application source (tests and node_modules are excluded via .dockerignore).
COPY --chown=node:node server/src ./src

# Frontend build output (served by the Express static middleware + SPA fallback).
COPY --chown=node:node web/dist ./web/dist

# Default data dir so the container works without a volume (mount over it in prod).
RUN mkdir -p /srv/fortress/data && chown -R node:node /srv/fortress

USER node

EXPOSE 3000

CMD ["node", "src/index.js"]
