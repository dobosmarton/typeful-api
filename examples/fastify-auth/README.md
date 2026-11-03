# Fastify Auth

A product API on Fastify 5 with `@typeful-api/fastify`, where bearer auth is enforced from the contract. Reads are public, writes need a token, and only the admin token may write. Use this setup when routes need authentication declared with `.withAuth()` and checked before the handler runs.

## What it demonstrates

- `src/api.ts`: `create`, `update` and `delete` declare `.withAuth('bearer')` and `.withErrors(403)` (plus 404 for `update` and `delete`). `.withAuth()` also adds a 401 response to the OpenAPI document.
- `src/index.ts`: `createFastifyPlugin(api, handlers, { auth: { bearer }, docsConfig })`, registered with `fastify.register(plugin, { prefix: '/api' })`.
- The `bearer` verifier looks the token up in `usersByToken`. An unknown token throws a plain `Error`, which becomes a 401 problem. A viewer token throws `HttpError(403, 'Only admins can change products')`, which is sent as is.
- A request without credentials gets a 401 problem with a `WWW-Authenticate: Bearer` header. Auth runs before body validation, so an unauthenticated write gets 401, not 422.
- `throw new HttpError(404, 'Product not found')` for missing products.

Demo tokens, defined in `src/index.ts`:

| Token          | Role   | Writes      |
| -------------- | ------ | ----------- |
| `admin-token`  | admin  | allowed     |
| `viewer-token` | viewer | 403 problem |
| anything else  | none   | 401 problem |

## Run it

```bash
# from the repository root
pnpm install
pnpm --filter './packages/*' build

cd examples/fastify-auth
pnpm dev
```

The server listens on `0.0.0.0`, port 3000. Set `PORT` to change it. Fastify logs each request as JSON. The OpenAPI document is at http://localhost:3000/api/api-doc.

## Try it

```bash
# Reads are public
curl http://localhost:3000/api/v1/products

# No token: 401
curl -i -X POST http://localhost:3000/api/v1/products \
  -H 'Content-Type: application/json' \
  -d '{"name":"Fountain pen","price":4900,"inStock":true}'
```

```
HTTP/1.1 401 Unauthorized
www-authenticate: Bearer
content-type: application/problem+json; charset=utf-8

{"type":"about:blank","title":"Unauthorized","status":401,"code":"UNAUTHORIZED","detail":"Missing credentials"}
```

An unknown token, such as `Bearer nope`, also gets a 401, with `"detail":"Authentication failed"`.

```bash
# Viewer token: 403
curl -X POST http://localhost:3000/api/v1/products \
  -H 'Authorization: Bearer viewer-token' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Fountain pen","price":4900,"inStock":true}'
```

The response is a 403 problem: `{"type":"about:blank","title":"Forbidden","status":403,"code":"FORBIDDEN","detail":"Only admins can change products"}`.

```bash
# Admin token: 200 with the created product
curl -X POST http://localhost:3000/api/v1/products \
  -H 'Authorization: Bearer admin-token' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Fountain pen","price":4900,"inStock":true}'

# Admin token, unknown product: 404 problem
curl -X DELETE http://localhost:3000/api/v1/products/00000000-0000-4000-8000-000000000000 \
  -H 'Authorization: Bearer admin-token'
```

## Files

- `src/api.ts`: Zod schemas and the API contract, including the auth and error declarations.
- `src/index.ts`: demo users, the `bearer` verifier, handlers, the Fastify app and the port.

## Next steps

See [Authentication](../../README.md#authentication) in the main README for the other auth types (`basic`, `apiKey`) and for using your own middleware instead.
