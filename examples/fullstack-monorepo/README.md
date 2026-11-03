# Fullstack Monorepo

A contract package shared by a Hono API and a React app. The web app calls the API through `createClient`, typed straight from the contract, with no code generation step. Use this setup when the frontend and the API live in the same repository.

## What it demonstrates

- `packages/contract` (`@example/contract`): the contract in `src/index.ts`. Products use `paginationQuery()`, `sortQuery(['name', 'price', 'createdAt'])` and `paginated()`. Categories use `cursorQuery()` and `cursorPaginated()`.
- `apps/api` (`@example/api`): `createHonoRouter<typeof api, AppVariables>` with group middlewares that put the in-memory data on the context (`c.set` / `c.get`), `HttpError(404)` for missing products and categories, CORS for `http://localhost:5173`, and Swagger UI from `@hono/swagger-ui` at `/api/api-reference`.
- `apps/web` (`@example/web`): `createClient(api, { baseUrl: 'http://localhost:3000/api' })` in `src/api/client.ts`. The TanStack Query options in `src/api/query-options.ts` call `.then(unwrap)`, and `InferClientArgs` types the list query.
- `unwrap()` returns the 200 body and throws a `ResponseError` for anything else, so TanStack Query treats error responses as failed queries.
- The write routes declare `.withAuth('bearer')`, but the API passes no `auth` option, so they stay open. See [fastify-auth](../fastify-auth) for enforcement.

## Run it

```bash
# from the repository root
pnpm install
pnpm --filter './packages/*' build

cd examples/fullstack-monorepo
pnpm dev
```

`pnpm dev` starts both apps: the API on http://localhost:3000 and the Vite dev server on http://localhost:5173. To run them in separate terminals, use `pnpm dev:api` and `pnpm dev:web`. The web app's base URL is fixed to port 3000, so keep the API on that port.

Other scripts:

- `pnpm generate` writes `apps/api/openapi.json` (git-ignored) with `typeful-api generate-spec`. The web app does not use it. If `typeful-api` is not found, run `pnpm install` again at the repository root after building the packages, so pnpm links the CLI.
- `pnpm typecheck` type-checks the contract, the API and the web app.

## Try it

```bash
# Products sorted by price, highest first
curl "http://localhost:3000/api/v1/products?sortBy=price&sortOrder=desc&limit=2"

# Categories, newest first. Pass nextCursor from one page to get the next.
curl "http://localhost:3000/api/v1/categories?limit=2"
curl "http://localhost:3000/api/v1/categories?limit=2&cursor=770e8400-e29b-41d4-a716-446655440002"

# Unknown sort field: 422 problem
curl "http://localhost:3000/api/v1/products?sortBy=stock"
```

The product list returns `{ items, total, page, limit, totalPages }`. The category list returns `{ items, nextCursor, hasMore }`. The last request returns:

```json
{
  "type": "about:blank",
  "title": "Unprocessable Content",
  "status": 422,
  "code": "VALIDATION_FAILED",
  "detail": "Invalid query parameters",
  "errors": [
    {
      "location": "query",
      "path": ["sortBy"],
      "message": "Invalid option: expected one of \"name\"|\"price\"|\"createdAt\""
    }
  ]
}
```

Open http://localhost:3000/api/api-reference for Swagger UI, or http://localhost:5173 for the product list.

## Files

- `packages/contract/src/index.ts`: schemas and the contract, imported by both apps.
- `apps/api/src/index.ts`: in-memory data, handlers, middlewares, CORS, Swagger UI and the server.
- `apps/web/src/api/client.ts`: the typed client.
- `apps/web/src/api/query-options.ts`: TanStack Query options for products and the health check.
- `apps/web/src/components/ProductList.tsx`: renders `productQueries.all()`.
- `apps/web/vite.config.ts`: Vite dev server on port 5173.

## Next steps

- [Typed Client](../../README.md#typed-client) in the main README covers the client options.
- For services in separate repositories, see [Calling typeful-api services from other repositories](../../docs/sharing-contracts.md).
