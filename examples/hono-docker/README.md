# Hono in Docker

A product API on Hono and Node.js (`@hono/node-server`), with a Dockerfile for a container image. Use this setup when you deploy your API as a Node.js container.

## What it demonstrates

- `src/api.ts`: the contract, built with `defineApi` and `route`. Version `v1` has a `health` route and a `products` group (`list`, `get`, `create`, `update`, `delete`).
- `src/index.ts`: `createHonoRouter<typeof api, AppVariables>`, mounted with `app.route('/api', router)` and served with `serve({ fetch: app.fetch, port })`. The process exits on `SIGTERM` and `SIGINT`.
- A group middleware (`middlewares: [productsMiddleware]`) that puts the in-memory products on the context.
- `throw new HttpError(404, 'Product not found')` for missing products, declared with `.withErrors(404)`.
- `Dockerfile`: two stages on `node:26-alpine`. The builder installs and builds the example and the workspace packages it depends on, then uses `pnpm deploy --prod` to collect `dist/` and the production dependencies. The runner copies only that, runs as the `node` user, sets `NODE_ENV=production` and `PORT=3000`, and has a `HEALTHCHECK` that requests `/api/v1/health`. The image is about 190 MB.
- The write routes declare `.withAuth('bearer')`. No `auth` option is passed, so the routes stay open. See [fastify-auth](../fastify-auth) for enforcement.

## Run it

Locally:

```bash
# from the repository root
pnpm install
pnpm --filter './packages/*' build

cd examples/hono-docker
pnpm dev
```

The server listens on port 3000. Set `PORT` to change it. `pnpm build` bundles into `dist/` and `pnpm start` runs the bundle.

With Docker:

```bash
pnpm docker:build   # docker build -f Dockerfile -t hono-docker-example ../..
pnpm docker:run     # docker run -p 3000:3000 hono-docker-example
```

The build context is the repository root, because the example depends on the workspace's `@typeful-api` packages and lockfile. `Dockerfile.dockerignore` (next to the Dockerfile) keeps `node_modules`, build output and docs out of that context. In your own project, where `@typeful-api/*` come from npm, the build stage is just `pnpm install --frozen-lockfile` and `pnpm build` in the project folder.

`pnpm generate` writes `openapi.json` and `src/api.generated.d.ts` (types only). Both are git-ignored. If `typeful-api` is not found, run `pnpm install` again at the repository root after building the packages, so pnpm links the CLI.

## Try it

```bash
# Root endpoint: reports NODE_ENV ("development" locally, "production" in the image)
curl http://localhost:3000/

# Health check, the same URL the Docker HEALTHCHECK uses
curl http://localhost:3000/api/v1/health

# List products
curl "http://localhost:3000/api/v1/products?limit=5"

# Missing product: 404 problem
curl -i http://localhost:3000/api/v1/products/00000000-0000-4000-8000-000000000000
```

The 404 response has `Content-Type: application/problem+json` and this body:

```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "code": "NOT_FOUND",
  "detail": "Product not found"
}
```

The OpenAPI document is at http://localhost:3000/api/api-doc.

## Files

- `src/api.ts`: Zod schemas and the API contract.
- `src/index.ts`: in-memory products, middleware, handlers, the server and signal handlers.
- `Dockerfile`: builder and runner stages, environment, exposed port and health check.
- `Dockerfile.dockerignore`: keeps `node_modules`, build output, `.git`, `.env*` and Markdown files out of the build context. BuildKit picks it up because it sits next to the Dockerfile.

## Next steps

See [hono-node](../hono-node) for the same API with handlers in separate files.
