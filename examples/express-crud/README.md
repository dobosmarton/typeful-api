# Express CRUD

A product CRUD API on Express 5 with `@typeful-api/express`, plus a script that calls it through the typed client. Use this setup when you have an Express app and want validation, Problem Details errors and an OpenAPI document from one Zod contract.

## What it demonstrates

- `src/api.ts`: the contract, built with `defineApi` and `route`. Version `v1` has a `health` route and a `products` group (`list`, `get`, `create`, `update`, `delete`).
- `src/index.ts`: `createExpressRouter(api, handlers, { docsConfig })`, mounted with `app.use('/api', router)`. Handlers receive validated `params`, `query` and `body`.
- `throw new HttpError(404, 'Product not found')` for missing products. The `get`, `update` and `delete` routes declare it with `.withErrors(404)`.
- `app.use(problemErrorHandler())` after the routes, so app-level errors also become Problem Details. Malformed JSON from `express.json()` returns a 400 problem.
- `src/client-demo.ts`: `createClient(api, { baseUrl })` from `@typeful-api/core/client`, `unwrap()`, and narrowing a response on `status` (404 and 422).
- The write routes declare `.withAuth('bearer')`. No `auth` option is passed, so this only documents the requirement in the OpenAPI document and the routes stay open. See [fastify-auth](../fastify-auth) for enforcement.

## Run it

```bash
# from the repository root
pnpm install
pnpm --filter './packages/*' build

cd examples/express-crud
pnpm dev
```

The server listens on port 3000. Set `PORT` to change it. The OpenAPI document is at http://localhost:3000/api/api-doc.

With the server running, run the client demo in a second terminal:

```bash
pnpm demo:client
```

On a fresh server it prints:

```
Listed 2 of 2 products
404 NOT_FOUND: Product not found
422 body.price: Too small: expected number to be >0
Created Fountain pen (<uuid>)
```

The demo calls `http://localhost:3000/api`. Set `API_URL` to point it elsewhere. Each run adds a product, so the count grows. `pnpm build` bundles the server into `dist/` with tsup, and `pnpm start` runs the bundle.

## Try it

```bash
# List products (page and limit are optional; limit is at most 100)
curl "http://localhost:3000/api/v1/products?page=1&limit=10"

# Create a product
curl -X POST http://localhost:3000/api/v1/products \
  -H 'Content-Type: application/json' \
  -d '{"name":"Fountain pen","price":4900,"inStock":true}'

# Missing product: 404 problem
curl -i http://localhost:3000/api/v1/products/00000000-0000-4000-8000-000000000000
```

The 404 response has `Content-Type: application/problem+json` and the body `{"type":"about:blank","title":"Not Found","status":404,"code":"NOT_FOUND","detail":"Product not found"}`.

An invalid body returns a 422 problem with one entry per invalid field:

```bash
curl -X POST http://localhost:3000/api/v1/products \
  -H 'Content-Type: application/json' \
  -d '{"name":"Pen","price":-1,"inStock":true}'
```

```json
{
  "type": "about:blank",
  "title": "Unprocessable Content",
  "status": 422,
  "code": "VALIDATION_FAILED",
  "detail": "Invalid request body",
  "errors": [
    { "location": "body", "path": ["price"], "message": "Too small: expected number to be >0" }
  ]
}
```

## Files

- `src/api.ts`: Zod schemas and the API contract.
- `src/index.ts`: in-memory products, handlers, the Express app and the port.
- `src/client-demo.ts`: typed client calls against the running server.

## Next steps

See the [main README](../../README.md#typed-client) for the typed client and [error handling](../../README.md#error-handling) reference.
