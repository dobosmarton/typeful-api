# Microservices: calling a service from another repository

Two services that share nothing but an OpenAPI document. The **orders service** (Hono) owns orders. The **checkout service** (Express) takes payments and calls the orders service through a typed client generated from the orders service's `/api/api-doc`.

Both live in this repository so CI can build them, but checkout never imports orders code. Treat them as two repositories owned by two teams. Use this setup when services are deployed and versioned separately.

```
checkout-service ──── HTTP ────▶ orders-service
  src/clients/orders.ts            /api/api-doc  (OpenAPI document)
  (generated from the document) ◀─ typeful-api generate-client
```

## What it demonstrates

- **Generating a client from another service's `/api-doc`**: `checkout-service/typeful.config.ts` lists the services checkout calls, and `pnpm generate:clients` writes `src/clients/orders.ts` with `createApiClient()`.
- **The same client experience as a shared contract**: `orders.v1.orders.get({ params: { id } })` mirrors the orders contract, and the response is a union narrowed by `status` (`checkout-service/src/index.ts`).
- **Typed errors across services**: orders answers with Problem Details. Checkout branches on the 404, on the custom `ORDER_NOT_PENDING` 409 problem (including its `currentStatus` extension member), and turns anything unexpected into a 502 `UPSTREAM_ERROR`.
- **Service-to-service auth**: orders requires a bearer token on its routes (`.withAuth('bearer')` plus the adapter's `auth` option). Checkout sends it through the client's `headers` option.
- **Keeping clients current**: `scripts/check-clients.mjs` starts the orders service, regenerates checkout's client and fails when it differs from the committed file. CI runs it, the same way a caller's CI would check against a real service.

## Run it

From the repository root, install and build the local packages the services use:

```bash
pnpm install
pnpm --filter './packages/*' build
pnpm install   # links the typeful-api CLI now that it is built
```

Then, in this folder:

```bash
pnpm dev          # orders on :3001, checkout on :3002
```

Or run them separately with `pnpm dev:orders` and `pnpm dev:checkout`.

Both services read their settings from environment variables:

| Variable        | Service  | Default                            |
| --------------- | -------- | ---------------------------------- |
| `PORT`          | both     | `3001` (orders), `3002` (checkout) |
| `SERVICE_TOKEN` | both     | `dev-service-token`                |
| `ORDERS_URL`    | checkout | `http://localhost:3001/api`        |

## Try it

The orders service starts with a pending order (`8f9c2a10-5b7e-4c3d-9a1f-2b6e4d8c1a01`) and a paid one (`…1a02`).

```bash
# Pay for the pending order → 200 with a receipt
curl -X POST localhost:3002/api/v1/checkout -H 'content-type: application/json' \
  -d '{"orderId":"8f9c2a10-5b7e-4c3d-9a1f-2b6e4d8c1a01","paymentMethod":"card"}'

# Pay again → 409
# {"type":"about:blank","title":"Conflict","status":409,"code":"ORDER_NOT_PAYABLE","detail":"Order is paid"}
curl -X POST localhost:3002/api/v1/checkout -H 'content-type: application/json' \
  -d '{"orderId":"8f9c2a10-5b7e-4c3d-9a1f-2b6e4d8c1a01","paymentMethod":"card"}'

# An order the orders service doesn't know → 404 from checkout
curl -X POST localhost:3002/api/v1/checkout -H 'content-type: application/json' \
  -d '{"orderId":"00000000-0000-4000-8000-000000000000","paymentMethod":"card"}'

# The orders API document the client is generated from
curl localhost:3001/api/api-doc
```

Start checkout with a wrong token (`SERVICE_TOKEN=wrong pnpm dev:checkout`) and the orders service answers 401, which checkout reports as a `502 UPSTREAM_ERROR` problem.

## Change the orders API

1. Edit `orders-service/src/api.ts`, for example add a route.
2. With the orders service running, run `pnpm generate` here. It regenerates `checkout-service/src/clients/orders.ts` from `http://localhost:3001/api/api-doc`.
3. Run `pnpm typecheck`. Checkout code that no longer matches the orders API fails to compile.
4. Commit the regenerated client. `pnpm check:clients` (and CI) fail until you do.

Generated clients are excluded from Prettier (see the repository's `.prettierignore`) so the check compares them byte for byte.

## Files

- `orders-service/src/api.ts`: the orders contract, including the custom `OrderNotPendingProblem`
- `orders-service/src/index.ts`: the Hono service, with service-token auth and `HttpError`s
- `checkout-service/typeful.config.ts`: which service documents to generate clients from
- `checkout-service/src/clients/orders.ts`: the generated client (types, route map, `createApiClient`)
- `checkout-service/src/api.ts`: checkout's own contract
- `checkout-service/src/index.ts`: the Express service calling orders through the client
- `scripts/check-clients.mjs`: fails when the committed client is out of date

## Next steps

[Calling services from other repositories](../../docs/sharing-contracts.md) compares this approach with publishing the contract as a package.
