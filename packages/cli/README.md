# @typeful-api/cli

[![npm version](https://img.shields.io/npm/v/@typeful-api/cli.svg)](https://www.npmjs.com/package/@typeful-api/cli)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

CLI for generating OpenAPI specs and TypeScript client types from [typeful-api](https://github.com/dobosmarton/typeful-api) contracts.

## Installation

```bash
npm install -D @typeful-api/cli
```

## Commands

### Init — Scaffold a New Project

Create a new typeful-api project from a template:

```bash
typeful-api init --template hono
typeful-api init --template express --dir ./my-api
typeful-api init --template fastify --name my-fastify-api
```

**Options:**

| Flag                                  | Description                          |
| ------------------------------------- | ------------------------------------ |
| `--template <hono\|express\|fastify>` | Framework template (default: `hono`) |
| `--dir <path>`                        | Target directory (default: `.`)      |
| `--name <string>`                     | Project name (defaults to dir name)  |

The generated project includes:

- `package.json` with the correct framework dependencies
- `tsconfig.json` with strict TypeScript configuration
- `src/api.ts` — typed API contract showcasing pagination and error helpers
- `src/index.ts` — framework-specific server entry point
- `.gitignore`

After scaffolding, run `pnpm install && pnpm dev` to start developing.

### Generate OpenAPI Spec

Generate an OpenAPI 3.0 spec from your API contract:

```bash
typeful-api generate-spec \
  --contract ./src/api.ts \
  --out ./openapi.json \
  --title "My API" \
  --api-version "1.0.0"
```

**Options:**

| Flag                     | Description                                             |
| ------------------------ | ------------------------------------------------------- |
| `--contract <path>`      | Path to the TypeScript file exporting your API contract |
| `--out <path>`           | Output path for the generated spec                      |
| `--title <string>`       | API title in the spec                                   |
| `--api-version <string>` | API version in the spec                                 |
| `--description <string>` | API description                                         |
| `--server <url>`         | Server URL to include in the spec                       |
| `--watch`                | Watch for changes and regenerate                        |

### Generate a Client

Generate a typed client for another service from its OpenAPI spec. Point `--spec` at the service's `/api-doc` (or a spec file) and write a `.ts` file:

```bash
typeful-api generate-client \
  --spec https://orders.internal/api/api-doc \
  --out ./src/clients/orders.ts \
  --header "Authorization: Bearer $DOCS_TOKEN"
```

The module exports `createApiClient`, which works like the typed client from `@typeful-api/core/client`: `{ params, query, body }` in, `{ status, body, headers }` out, narrowed by status:

```typescript
import { createApiClient } from './clients/orders';

const orders = createApiClient({ baseUrl: process.env.ORDERS_URL! });
const res = await orders.v1.orders.get({ params: { id: '42' } });
if (res.status === 404) console.log(res.body.detail);
```

The generated code imports `@typeful-api/core`, so install it in the calling service. Specs from typeful-api services rebuild the contract's `version → group → route` tree. Other OpenAPI 3 specs work too: each operation is keyed by its `operationId`.

To write types only, as in earlier versions, use a `.d.ts` output and pair it with a client such as `openapi-fetch`:

```bash
typeful-api generate-client --spec ./openapi.json --out ./src/client.d.ts
```

**Options:**

| Flag                 | Description                                                 |
| -------------------- | ----------------------------------------------------------- |
| `--spec <path\|url>` | OpenAPI spec file or URL (JSON)                             |
| `--out <path>`       | `.ts` for a typed client module, `.d.ts` for types only     |
| `--header <header>`  | `"Name: value"` header for fetching a spec URL (repeatable) |
| `--watch`            | Watch a local spec file and regenerate                      |

## Config File

Instead of passing options via CLI flags every time, create a `typeful.config.ts` in your project root:

```typescript
import { defineConfig } from '@typeful-api/cli';

export default defineConfig({
  spec: {
    contract: './src/api.ts',
    out: './openapi.json',
    title: 'My API',
    apiVersion: '1.0.0',
    servers: ['https://api.example.com'],
  },
  client: {
    spec: './openapi.json',
    out: './src/client.d.ts',
  },
});
```

To generate clients for several services, use a list:

```typescript
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

Then run commands without flags:

```bash
typeful-api generate-spec
typeful-api generate-client
```

CLI flags override config file values. Supported file formats: `.ts`, `.mts`, `.js`, `.mjs`, `.json`.

## Programmatic API

You can also use the CLI as a library:

```typescript
import { generateSpec, generateClient } from '@typeful-api/cli';
import { api } from './api';

// Generate OpenAPI spec
await generateSpec({
  contract: api,
  out: './openapi.json',
  title: 'My API',
  version: '1.0.0',
});

// Generate a typed client module from another service's spec
await generateClient({
  spec: 'https://orders.internal/api/api-doc',
  out: './src/clients/orders.ts',
  headers: { Authorization: `Bearer ${process.env.DOCS_TOKEN}` },
});
```

## Watch Mode

Use `--watch` during development to regenerate the spec automatically when your contract changes (`generate-client --watch` works the same way for a local spec file):

```bash
typeful-api generate-spec \
  --contract ./src/api.ts \
  --out ./openapi.json \
  --title "My API" \
  --api-version "1.0.0" \
  --watch
```

## Documentation

For full documentation, examples, and guides, visit the [typeful-api repository](https://github.com/dobosmarton/typeful-api).

## License

MIT
