# @typeful-api/core

[![npm version](https://img.shields.io/npm/v/@typeful-api/core.svg)](https://www.npmjs.com/package/@typeful-api/core)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Framework-agnostic core for building end-to-end type-safe OpenAPI-first APIs. Define your API contract once with Zod schemas, get full type inference for handlers and a typed client, and generate OpenAPI specs automatically.

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
  .withErrors(404)
  .withSummary('Get a product by ID');
```

### Define API Contract

Structure your API with versioning and route groups:

```typescript
import { defineApi } from '@typeful-api/core';

export const api = defineApi({
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

## Typed Client

`@typeful-api/core/client` creates a typed HTTP client from the same contract. There is no code generation step, and the entry is browser-safe (about 6 KB minified, plus zod).

```typescript
import { createClient, unwrap } from '@typeful-api/core/client';
import { api } from './api';

const client = createClient(api, {
  baseUrl: 'https://api.example.com',
  headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
});

const res = await client.v1.products.get({ params: { id: '42' } });
if (res.status === 200) {
  console.log(res.body.name);
} else if (res.status === 404) {
  console.log(res.body.detail); // Problem Details body
}

// Body of a 200 response, or throws a ResponseError
const products = await client.v1.products.list().then(unwrap);
```

Each call returns `{ status, body, headers }`, a union narrowed by `status` that covers the 200 response, the declared error responses, and the 422/401 problems the adapters send for invalid input and failed auth. Undeclared statuses reject with `UnexpectedResponseError`.

| Option             | Description                                                             |
| ------------------ | ----------------------------------------------------------------------- |
| `baseUrl`          | Where the API router is mounted                                         |
| `headers`          | Headers for every request, or a (sync or async) function returning them |
| `fetch`            | Custom `fetch` implementation                                           |
| `fetchOptions`     | `fetch` options for every request, e.g. `{ credentials: 'include' }`    |
| `validateResponse` | Parse bodies with their Zod schema (transforms apply). Default: off     |

| Export                                         | Description                                               |
| ---------------------------------------------- | --------------------------------------------------------- |
| `createClient(contract, options)`              | Create the client                                         |
| `unwrap(response)`                             | Return the 200 body or throw a `ResponseError`            |
| `ResponseError`                                | Base error with `status`, `body`, `headers` and `problem` |
| `UnexpectedResponseError`                      | A status the route does not declare, or invalid JSON      |
| `ResponseValidationError`                      | With `validateResponse`: the body does not match          |
| `InferClientArgs<F>` / `InferClientBody<F, S>` | Argument and body types of a client function              |

## Errors and Problem Details

Adapters send every error as an [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) Problem Details object (`application/problem+json`): `{ type, title, status, detail?, instance?, code, errors? }`. `code` is a stable machine-readable value, and `errors` lists field-level validation problems.

Throw `HttpError` from handlers or middleware:

```typescript
import { HttpError } from '@typeful-api/core';

throw new HttpError(404, 'Product not found');
throw new HttpError(409, { code: 'DUPLICATE_NAME', detail: 'Name is already taken' });
throw new HttpError(429, { headers: { 'Retry-After': '30' } });
```

Declare the errors a route can return. The schemas document the Problem Details bodies, with literal `status` and `code` values:

```typescript
import { problemSchema } from '@typeful-api/core';

// Built-in schemas for common status codes
route.get('/:id').returns(ProductSchema).withErrors(404, 403);

// Your own problem types, optionally with extension members
const DuplicateName = problemSchema(409, 'DUPLICATE_NAME', { existingId: z.string() });
route
  .post('/')
  .body(CreateProductSchema)
  .returns(ProductSchema)
  .withResponses({ 409: DuplicateName });
```

Routes with input automatically document a `422` response, and routes with `.withAuth()` a `401`.

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
| `.withOperationId(id)`                                                         | Custom OpenAPI operation ID                  |
| `.markDeprecated()`                                                            | Mark route as deprecated                     |
| `.withExamples({ requestBody?, responses? })`                                  | Request/response examples for OpenAPI docs   |
| `.withResponseHeaders({ name: schema })`                                       | Typed response headers                       |

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

The query helpers use `z.coerce.number<number>()`, which converts query strings to numbers on the server and lets the typed client accept numbers.

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

| Export                                    | Description                                                |
| ----------------------------------------- | ---------------------------------------------------------- |
| `HttpError`                               | Throw to send a Problem Details response                   |
| `problemSchema(status, code, extension?)` | Schema for a custom problem type                           |
| `badRequestError()`                       | `400` problem, code `BAD_REQUEST`, optional `errors`       |
| `unauthorizedError()`                     | `401` problem, code `UNAUTHORIZED`                         |
| `forbiddenError()`                        | `403` problem, code `FORBIDDEN`                            |
| `notFoundError()`                         | `404` problem, code `NOT_FOUND`                            |
| `conflictError()`                         | `409` problem, code `CONFLICT`                             |
| `unprocessableError()`                    | `422` problem, code `VALIDATION_FAILED`, optional `errors` |
| `rateLimitError()`                        | `429` problem, code `RATE_LIMIT_EXCEEDED`                  |
| `internalError()`                         | `500` problem, code `INTERNAL_ERROR`                       |
| `commonErrors(...codes)`                  | Batch helper returning `{ [status]: schema }`              |
| `createProblem(status, init?)`            | Build a Problem Details body                               |

## Framework Adapters

Use the core contract with any of the official adapters:

- [`@typeful-api/hono`](https://www.npmjs.com/package/@typeful-api/hono) — Hono (Node.js, Cloudflare Workers, Deno, Bun)
- [`@typeful-api/express`](https://www.npmjs.com/package/@typeful-api/express) — Express 4.x / 5.x
- [`@typeful-api/fastify`](https://www.npmjs.com/package/@typeful-api/fastify) — Fastify 5.x

## Documentation

For full documentation, examples, and guides, visit the [typeful-api repository](https://github.com/dobosmarton/typeful-api).

## License

MIT
