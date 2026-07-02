FROM node:22-alpine

WORKDIR /app

# Dependency layer (cached until a package.json or the lockfile changes).
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/llm/package.json packages/llm/
COPY packages/content-ulster/package.json packages/content-ulster/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN npm ci

# Sources: build the web bundle, then drop build-only dev dependencies.
# The server runs the TypeScript sources directly via tsx (a runtime dep),
# so no compile step is needed for the backend.
COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

# Game saves land in /app/packages/server/data — mount a volume to keep them.
CMD ["npm", "start"]
