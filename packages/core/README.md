# @typeful-api/core

[![npm version](https://img.shields.io/npm/v/@typeful-api/core.svg)](https://www.npmjs.com/package/@typeful-api/core)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Framework-agnostic core for building end-to-end type-safe OpenAPI-first APIs. Define your API contract once with Zod schemas, get full type inference, and generate OpenAPI specs automatically.

Part of the [typeful-api](https://github.com/dobosmarton/typeful-api) monorepo.

## Installation

```bash
npm install @typeful-api/core zod
```

## Usage

### Define Routes

Use the fluent `route` builder to define type-safe routes with Zod schemas:

```typescript
import { route } from '@typeful-api/core';
import { z } from 'zod';

const listProducts = route
  .get('/')
  .returns(z.array(ProductSchema))
  .withSummary('List all products');

const createProduct = route
  .post('/')
  .body(CreateProductSchema)
  .returns(ProductSchema)
  .withAuth('bearer')
  .withSummary('Create a product');

const getProduct = route
  .get('/:id')
  .params(z.object({ id: z.uuid() }))
  .returns(ProductSchema)
  .withResponses({ 404: NotFoundError })
  .withSummary('Get a product by ID');
```

### Define API Contract

Structure your API with versioning and route groups:

```typescript
import { defineApi } from '@typeful-api/core';

const api = defineApi({
  v1: {
    children: {
      products: {
        routes: {
          list: listProducts,
          get: getProduct,
          create: createProduct,
        },
      },
    },
  },
});
```

### Generate OpenAPI Spec

```typescript
import { generateSpec } from '@typeful-api/core';

const spec = generateSpec(api, {
  info: { title: 'My API', version: '1.0.0' },
});
```

## Route Builder API

The `route` builder supports chaining the following methods:

| Method                                                                         | Description                                  |
| ------------------------------------------------------------------------------ | -------------------------------------------- |
| `.get(path)` / `.post(path)` / `.put(path)` / `.patch(path)` / `.delete(path)` | Set HTTP method and path                     |
| `.params(schema)`                                                              | Path parameters schema                       |
| `.query(schema)`                                                               | Query parameters schema                      |
| `.body(schema)`                                                                | Request body schema                          |
| `.returns(schema)`                                                             | Success response schema                      |
| `.withResponses({ status: schema })`                                           | Additional response schemas                  |
| `.withErrors(404, 401, ...)`                                                   | Add typed error responses (built-in schemas) |
| `.withAuth('bearer' \| 'basic' \| 'apiKey')`                                   | Mark route as authenticated                  |
| `.withSummary(text)`                                                           | OpenAPI summary                              |
| `.withTags(...tags)`                                                           | OpenAPI tags                                 |
| `.markDeprecated()`                                                            | Mark route as deprecated                     |

## Pagination & Filtering Helpers

Schema factories for common API query and response patterns:

```typescript
import {
  paginationQuery,
  paginated,
  sortQuery,
  cursorQuery,
  cursorPaginated,
} from '@typeful-api/core';

// Offset-based: { page, limit } with defaults and maxLimit
route.get('/').query(paginationQuery()).returns(paginated(ProductSchema));

// Cursor-based: { cursor?, limit } → { items, nextCursor, hasMore }
route.get('/feed').query(cursorQuery()).returns(cursorPaginated(PostSchema));

// Sort: { sortBy?, sortOrder? } with type-safe field names
route
  .get('/')
  .query(sortQuery(['name', 'createdAt'] as const))
  .returns(paginated(ProductSchema));
```

All query helpers use `z.coerce.number()` for automatic HTTP query string conversion.

## Error Response Helpers

Pre-built error schemas and a shorthand for common HTTP errors:

```typescript
import { notFoundError, commonErrors, errorSchema } from '@typeful-api/core';

// Shorthand — adds typed 404 and 401 responses
route.get('/:id').returns(ProductSchema).withErrors(404, 401);

// Equivalent using withResponses()
route.get('/:id').returns(ProductSchema).withResponses(commonErrors(404, 401));

// Custom error schema
const CustomError = errorSchema('CUSTOM_ERROR', 'Something went wrong');
```

Available status codes: `400` (Bad Request), `401` (Unauthorized), `403` (Forbidden), `404` (Not Found), `409` (Conflict), `422` (Unprocessable Entity), `429` (Rate Limit), `500` (Internal Error).

## Contract Helpers

| Export                                | Description                               |
| ------------------------------------- | ----------------------------------------- |
| `defineApi(contract)`                 | Define a full versioned API contract      |
| `defineGroup(group)`                  | Define a route group                      |
| `defineRoutes(routes)`                | Define a set of routes                    |
| `defineVersions(versions)`            | Define API versions                       |
| `generateSpec(contract, options)`     | Generate an OpenAPI 3.0 document object   |
| `generateSpecJson(contract, options)` | Generate an OpenAPI spec as a JSON string |

## Pagination Helpers

| Export                        | Description                                       |
| ----------------------------- | ------------------------------------------------- |
| `paginationQuery(options?)`   | Offset-based query: `{ page, limit }`             |
| `cursorQuery(options?)`       | Cursor-based query: `{ cursor?, limit }`          |
| `sortQuery(fields, options?)` | Sort query: `{ sortBy?, sortOrder? }`             |
| `paginated(itemSchema)`       | Paginated response: `{ items, total, page, ... }` |
| `cursorPaginated(itemSchema)` | Cursor response: `{ items, nextCursor, hasMore }` |

## Error Helpers

| Export                    | Description                                     |
| ------------------------- | ----------------------------------------------- |
| `errorSchema(code, msg?)` | Create a custom error schema with literal code  |
| `badRequestError()`       | `{ code: 'BAD_REQUEST', message, details }`     |
| `unauthorizedError()`     | `{ code: 'UNAUTHORIZED', message }`             |
| `forbiddenError()`        | `{ code: 'FORBIDDEN', message }`                |
| `notFoundError()`         | `{ code: 'NOT_FOUND', message }`                |
| `conflictError()`         | `{ code: 'CONFLICT', message }`                 |
| `unprocessableError()`    | `{ code: 'UNPROCESSABLE_ENTITY', message }`     |
| `rateLimitError()`        | `{ code: 'RATE_LIMIT_EXCEEDED', message }`      |
| `internalError()`         | `{ code: 'INTERNAL_ERROR', message }`           |
| `commonErrors(...codes)`  | Batch helper returning `Record<status, schema>` |

## Framework Adapters

Use the core contract with any of the official adapters:

- [`@typeful-api/hono`](https://www.npmjs.com/package/@typeful-api/hono) — Hono (Node.js, Cloudflare Workers, Deno, Bun)
- [`@typeful-api/express`](https://www.npmjs.com/package/@typeful-api/express) — Express 4.x / 5.x
- [`@typeful-api/fastify`](https://www.npmjs.com/package/@typeful-api/fastify) — Fastify 4.x+

## Documentation

For full documentation, examples, and guides, visit the [typeful-api repository](https://github.com/dobosmarton/typeful-api).

## License

MIT
