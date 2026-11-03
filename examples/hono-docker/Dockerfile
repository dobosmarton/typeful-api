# Builds this example from inside the typeful-api monorepo. Run from the repository root:
#
#   docker build -f examples/hono-docker/Dockerfile -t hono-docker-example .
#
# (or `pnpm docker:build` in this folder). The repository root is the build context because the
# example depends on the workspace's @typeful-api packages and lockfile. In your own project,
# where @typeful-api/* come from npm, the build stage is just `pnpm install` and `pnpm build`.

# Build stage: install and build the example and the packages it depends on, then collect it
# with its production dependencies in /deploy
FROM node:26-alpine AS builder

# Corepack is no longer bundled with Node.js 25+; use the repository's pnpm version
RUN npm install -g pnpm@10.34.9

WORKDIR /repo
COPY . .

RUN pnpm install --frozen-lockfile --filter "hono-docker-example..."
RUN pnpm --filter "hono-docker-example..." build
RUN pnpm --filter hono-docker-example deploy --prod --legacy /deploy

# Runtime stage: only the built app and its production dependencies
FROM node:26-alpine AS runner

WORKDIR /app
COPY --from=builder /deploy ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/v1/health || exit 1

USER node

CMD ["node", "dist/index.js"]
