# Hono on Node.js

A product API on Hono and Node.js (`@hono/node-server`), with each handler in its own file. Use this layout when the router file gets too long to keep every handler inline.

## What it demonstrates

- `src/api.ts`: the contract, built with `defineApi` and `route`. Version `v1` has a `health` route and a `products` group (`list`, `get`, `create`, `update`, `delete`).
- `src/types.ts`: `InferHonoHandlersWithVars<typeof api, AppVariables>` gives the type of the whole handler map. `HealthHandler` and `ProductHandlers` index into it (`AppHandlers['v1']['products']`).
- `src/handlers/products.ts`: each handler is typed as `ProductHandlers['list']`, `ProductHandlers['get']` and so on, so `params`, `query`, `body` and the return value are checked against the contract without importing the Zod schemas.
- `src/index.ts`: passes the imported handlers to `createHonoRouter<typeof api, AppVariables>` and mounts the router with `app.route('/api', router)`. `products.deleteProduct` is mapped to the `delete` route, since `delete` is a reserved word.
- `throw new HttpError(404, 'Product not found')` for missing products, declared with `.withErrors(404)`.
- The write routes declare `.withAuth('bearer')`. No `auth` option is passed, so the routes stay open. See [fastify-auth](../fastify-auth) for enforcement.

## Run it

```bash
# from the repository root
pnpm install
pnpm --filter './packages/*' build

cd examples/hono-node
pnpm dev
```

The server listens on port 3000. Set `PORT` to change it. The OpenAPI document is at http://localhost:3000/api/api-doc. `pnpm build` bundles into `dist/` with tsup, and `pnpm start` runs the bundle.

`pnpm generate` writes `openapi.json` and `src/api.generated.d.ts` (types only). Both are git-ignored. If `typeful-api` is not found, run `pnpm install` again at the repository root after building the packages, so pnpm links the CLI.

## Try it

```bash
# List products
curl "http://localhost:3000/api/v1/products?page=1&limit=1"

# Update a product
curl -X PATCH http://localhost:3000/api/v1/products/550e8400-e29b-41d4-a716-446655440001 \
  -H 'Content-Type: application/json' \
  -d '{"inStock":false}'

# Delete a product
curl -X DELETE http://localhost:3000/api/v1/products/550e8400-e29b-41d4-a716-446655440002

# Missing product: 404 problem
curl http://localhost:3000/api/v1/products/00000000-0000-4000-8000-000000000000
```

```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "code": "NOT_FOUND",
  "detail": "Product not found"
}
```

```bash
# limit above 100: 422 problem
curl "http://localhost:3000/api/v1/products?limit=500"
```

```json
{
  "type": "about:blank",
  "title": "Unprocessable Content",
  "status": 422,
  "code": "VALIDATION_FAILED",
  "detail": "Invalid query parameters",
  "errors": [
    { "location": "query", "path": ["limit"], "message": "Too big: expected number to be <=100" }
  ]
}
```

The delete request returns `{"success":true}`.

## Files

- `src/api.ts`: Zod schemas and the API contract.
- `src/types.ts`: `AppVariables`, `AppEnv` and the handler types derived from the contract.
- `src/handlers/health.ts`, `src/handlers/products.ts`: the handlers.
- `src/index.ts`: in-memory products, middleware, the router and the server.
- `openapi.json`, `src/api.generated.d.ts`: written by `pnpm generate`.

## Next steps

See [Handlers in Separate Files](../../README.md#5-handlers-in-separate-files) in the main README.
