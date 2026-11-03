# Calling typeful-api services from other repositories

In a monorepo, a frontend or another service imports the contract and calls `createClient(api)`. When services live in separate repositories, that import isn't available. There are two ways to get the same typed client:

|                                     | Generate from `/api-doc`                                | Publish the contract as a package        |
| ----------------------------------- | ------------------------------------------------------- | ---------------------------------------- |
| What the caller needs               | The service's OpenAPI document (a URL or file)          | An npm package with the contract         |
| Setup                               | One CLI command per service                             | A build and publish step in each service |
| Typing                              | From the document, per status, including problem bodies | From the Zod schemas, per status         |
| Response validation                 | No                                                      | Optional (`validateResponse`)            |
| Works with non-typeful-api services | Yes, any OpenAPI 3 spec                                 | No                                       |

## Generate a client from the service's /api-doc

Every typeful-api adapter serves an OpenAPI document (at `/api-doc` by default). The CLI turns it into a typed client module. The [microservices example](../examples/microservices) shows the whole setup with two running services.

```bash
pnpm add @typeful-api/core
pnpm add -D @typeful-api/cli

typeful-api generate-client \
  --spec https://orders.internal/api/api-doc \
  --out src/clients/orders.ts
```

```typescript
import { unwrap } from '@typeful-api/core/client';
import { createApiClient } from './clients/orders';

const orders = createApiClient({
  baseUrl: process.env.ORDERS_URL!, // where the orders router is mounted, e.g. https://orders.internal/api
  headers: async () => ({ Authorization: `Bearer ${await getServiceToken()}` }),
});

const res = await orders.v1.orders.get({ params: { id } });
switch (res.status) {
  case 200:
    return res.body;
  case 404:
    return null; // res.body is the NOT_FOUND problem
}

const page = await orders.v1.orders.list({ query: { page: 2 } }).then(unwrap);
```

The client mirrors the service's contract (`orders.v1.orders.get`) because typeful-api writes each route's position into the document as an `x-typeful-route` extension. Calls behave like the contract client: path parameters, query and JSON body are typed from the document, the result is narrowed by `status`, and a status the document doesn't list throws `UnexpectedResponseError`.

### Several services

List them in `typeful.config.ts` and run `typeful-api generate-client` without flags:

```typescript
import { defineConfig } from '@typeful-api/cli';

export default defineConfig({
  client: [
    {
      spec: 'https://orders.internal/api/api-doc',
      out: './src/clients/orders.ts',
      headers: { Authorization: `Bearer ${process.env.DOCS_TOKEN}` },
    },
    { spec: 'https://payments.internal/api/api-doc', out: './src/clients/payments.ts' },
  ],
});
```

### Keeping clients up to date

The microservices example includes a [check script](../examples/microservices/scripts/check-clients.mjs) that does this in CI.

The generated files are plain TypeScript, so commit them and regenerate when a service changes its API. A scheduled CI job that runs `typeful-api generate-client` and opens a pull request when the files change catches breaking changes before they reach production: the pull request fails type-checking wherever your code no longer matches the API.

If a service can't be reached from CI, have it publish its document as a build artifact (`typeful-api generate-spec`) and point `--spec` at the file instead.

### Good to know

- The generated module imports `@typeful-api/core`, so the calling service needs it installed. It doesn't need the service's code or Zod schemas.
- Responses are not validated at runtime: the types come from the document, not from Zod schemas.
- Services that use API versioning (`v1`, `v2`) can add a version while callers move over at their own pace. Each version is a separate branch of the client (`orders.v2.orders.get`).
- Specs from other tools work too. Without `x-typeful-route`, each operation is keyed by its `operationId` (`client.getOrder(...)`).

## Publish the contract as a package

If all services are TypeScript and you have a private registry (GitHub Packages, a private npm scope, Verdaccio), each service can publish its contract instead. Callers then use `createClient` exactly as in a monorepo, including `validateResponse`.

Keep the contract in its own folder, next to the service code, with only Zod schemas and `defineApi`:

```
orders-service/
  contract/              → published as @acme/orders-contract
    src/index.ts         defineApi(...) and its schemas, nothing else
    package.json
    tsup.config.ts
  src/                   the service itself, imports ../contract
```

```jsonc
// contract/package.json
{
  "name": "@acme/orders-contract",
  "version": "1.4.0",
  "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "scripts": { "build": "tsup src/index.ts --format esm --dts" },
  // Peers, so the caller and the contract share one copy of each
  "peerDependencies": { "@typeful-api/core": "^0.3.0", "zod": "^4.0.0" },
  "devDependencies": { "@typeful-api/core": "^0.3.0", "tsup": "^9.0.0", "zod": "^4.6.7" },
}
```

```typescript
// In the calling service
import { createClient } from '@typeful-api/core/client';
import { api as ordersApi } from '@acme/orders-contract';

const orders = createClient(ordersApi, { baseUrl: process.env.ORDERS_URL! });
```

Version the package with semver: a new major version means the API changed incompatibly. Adding a new API version key (`v2`) next to the old one is a minor release, because existing callers keep working.

## Which one to pick

- **Separate teams, other languages, or no shared registry:** generate from `/api-doc`. The document is the only thing services share.
- **TypeScript everywhere with a private registry, and you want runtime validation:** publish the contract.

Both can coexist. A service can publish its contract for TypeScript callers and still serve `/api-doc` for everyone else.
