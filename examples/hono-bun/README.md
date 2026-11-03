# Hono on Bun

A product API on Hono and Bun. Bun serves the module's default export (`{ port, fetch: app.fetch }`), so no server adapter package is needed. Use this setup when you run your API on Bun.

## What it demonstrates

- `src/api.ts`: the contract, built with `defineApi` and `route`. Version `v1` has a `health` route and a `products` group (`list`, `get`, `create`, `update`, `delete`).
- `src/index.ts`: `createHonoRouter<typeof api, AppVariables>`, mounted with `app.route('/api', router)`. `SimpleEnv<AppVariables>` types the app.
- A group middleware (`middlewares: [productsMiddleware]`) that puts the in-memory products on the context, read in handlers with `c.get('products')`.
- `throw new HttpError(404, 'Product not found')` for missing products, declared with `.withErrors(404)`.
- `typeful-api generate-spec` and `typeful-api generate-client` through the `generate` script.
- The write routes declare `.withAuth('bearer')`. No `auth` option is passed, so the routes stay open. See [fastify-auth](../fastify-auth) for enforcement.

## Run it

Requires [Bun](https://bun.sh).

```bash
# from the repository root
pnpm install
pnpm --filter './packages/*' build

cd examples/hono-bun
pnpm dev
```

`pnpm dev` runs `bun run --watch src/index.ts`. `pnpm start` runs it without watching. The server listens on port 3000. Set `PORT` to change it. The OpenAPI document is at http://localhost:3000/api/api-doc.

To write the OpenAPI document and the client types:

```bash
pnpm generate
```

This writes `openapi.json` and `src/api.generated.d.ts` (types only). Both are git-ignored. If `typeful-api` is not found, run `pnpm install` again at the repository root after building the packages, so pnpm links the CLI.

## Try it

```bash
# List products
curl http://localhost:3000/api/v1/products

# Update a product
curl -X PATCH http://localhost:3000/api/v1/products/550e8400-e29b-41d4-a716-446655440002 \
  -H 'Content-Type: application/json' \
  -d '{"inStock":false}'

# Missing product: 404 problem with "code":"NOT_FOUND" and "detail":"Product not found"
curl http://localhost:3000/api/v1/products/00000000-0000-4000-8000-000000000000

# Empty name: 422 problem
curl -X POST http://localhost:3000/api/v1/products \
  -H 'Content-Type: application/json' \
  -d '{"name":"","price":4900,"inStock":true}'
```

```json
{
  "type": "about:blank",
  "title": "Unprocessable Content",
  "status": 422,
  "code": "VALIDATION_FAILED",
  "detail": "Invalid request body",
  "errors": [
    {
      "location": "body",
      "path": ["name"],
      "message": "Too small: expected string to have >=1 characters"
    }
  ]
}
```

## Files

- `src/api.ts`: Zod schemas and the API contract.
- `src/index.ts`: in-memory products, middleware, handlers and the Bun default export.
- `openapi.json`, `src/api.generated.d.ts`: written by `pnpm generate`.

## Next steps

See [hono-node](../hono-node) for the same API on Node.js with handlers in separate files, and [CLI Commands](../../README.md#cli-commands) in the main README.
