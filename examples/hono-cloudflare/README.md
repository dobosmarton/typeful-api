# Hono on Cloudflare Workers

A product API on Hono, running as a Cloudflare Worker. `src/index.ts` exports the Hono app as the Worker's default export. Use this setup when you deploy your API to Cloudflare Workers.

## What it demonstrates

- `src/api.ts`: the contract, built with `defineApi` and `route`. Version `v1` has a `health` route and a `products` group (`list`, `get`, `create`, `update`, `delete`).
- `src/index.ts`: `createHonoRouter<typeof api, EnvMap>` with a per-group environment map. `Env` types the Worker bindings, and `WithVariables<BaseEnv, { products: Product[] }>` adds the `products` variable to the `products` group only.
- A group middleware (`middlewares: [productsMiddleware]`) that puts the in-memory products on the context, read in handlers with `c.get('products')`.
- `throw new HttpError(404, 'Product not found')` for missing products, declared with `.withErrors(404)`.
- `typeful-api generate-spec` and `typeful-api generate-client` through the `generate` script.
- The write routes declare `.withAuth('bearer')`. No `auth` option is passed, so the routes stay open. The `ENVIRONMENT` variable from `wrangler.toml` is a typed binding (`Env`), returned by the root endpoint as `c.env.ENVIRONMENT`.

## Run it

Uses `wrangler` from the example's dev dependencies, so no global install is needed.

```bash
# from the repository root
pnpm install
pnpm --filter './packages/*' build

cd examples/hono-cloudflare
pnpm dev
```

`pnpm dev` runs `wrangler dev src/index.ts`, which serves the Worker on http://localhost:8787. `pnpm build` runs `wrangler deploy --dry-run`, which bundles the Worker without uploading it.

To deploy, run `pnpm exec wrangler login`, then `pnpm exec wrangler deploy`. The Worker name is `hono-cloudflare-example`, from `wrangler.toml`.

Products are kept in a module-level array. Each Worker isolate has its own copy, and changes are lost when the isolate stops.

`pnpm generate` writes `openapi.json` and `src/api.generated.d.ts` (types only). Both are git-ignored. If `typeful-api` is not found, run `pnpm install` again at the repository root after building the packages, so pnpm links the CLI.

## Try it

```bash
# Health check
curl http://localhost:8787/api/v1/health

# Create a product
curl -X POST http://localhost:8787/api/v1/products \
  -H 'Content-Type: application/json' \
  -d '{"name":"Fountain pen","price":4900,"inStock":true}'

# Missing product: 404 problem
curl http://localhost:8787/api/v1/products/00000000-0000-4000-8000-000000000000
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
# Invalid id: 422 problem
curl http://localhost:8787/api/v1/products/not-a-uuid
```

```json
{
  "type": "about:blank",
  "title": "Unprocessable Content",
  "status": 422,
  "code": "VALIDATION_FAILED",
  "detail": "Invalid path parameters",
  "errors": [{ "location": "params", "path": ["id"], "message": "Invalid UUID" }]
}
```

The OpenAPI document is at http://localhost:8787/api/api-doc.

## Files

- `src/api.ts`: Zod schemas and the API contract.
- `src/index.ts`: environment types, in-memory products, middleware, handlers and the exported app.
- `wrangler.toml`: Worker name, entry point, compatibility date and the `ENVIRONMENT` variable.
- `openapi.json`, `src/api.generated.d.ts`: written by `pnpm generate`.

## Next steps

See [Framework Adapters](../../README.md#framework-adapters) in the main README for the Hono adapter options.
