# @typeful-api/fastify

[![npm version](https://img.shields.io/npm/v/@typeful-api/fastify.svg)](https://www.npmjs.com/package/@typeful-api/fastify)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Fastify adapter for [typeful-api](https://github.com/dobosmarton/typeful-api) — build end-to-end type-safe OpenAPI-first APIs with Fastify. Compatible with **Fastify 4.x+**.

## Installation

```bash
npm install @typeful-api/core @typeful-api/fastify fastify zod
```

## Quick Start

### 1. Define Your Contract

```typescript
import { defineApi, route } from '@typeful-api/core';
import { z } from 'zod';

const api = defineApi({
  v1: {
    children: {
      products: {
        routes: {
          list: route.get('/').returns(z.array(ProductSchema)).withSummary('List all products'),
          create: route
            .post('/')
            .body(CreateProductSchema)
            .returns(ProductSchema)
            .withAuth('bearer')
            .withSummary('Create a product'),
        },
      },
    },
  },
});
```

### 2. Register the Plugin

```typescript
import Fastify from 'fastify';
import { createFastifyPlugin, getLocals } from '@typeful-api/fastify';

const fastify = Fastify();

fastify.register(
  createFastifyPlugin(api, {
    v1: {
      products: {
        list: async ({ request }) => {
          const { db } = getLocals<{ db: Database }>(request);
          return await db.products.findMany();
        },
        create: async ({ request, body }) => {
          const { db } = getLocals<{ db: Database }>(request);
          return await db.products.create({ id: crypto.randomUUID(), ...body });
        },
      },
    },
  }),
  { prefix: '/api' },
);

fastify.listen({ port: 3000 });
```

## Hierarchical PreHandlers

Apply preHandler hooks at version, group, or route level:

```typescript
fastify.register(
  createFastifyPlugin(api, {
    v1: {
      preHandler: [corsPreHandler], // All v1 routes
      products: {
        preHandler: [dbPreHandler], // All product routes
        list: handler,
        create: handler,
      },
    },
  }),
  { prefix: '/api' },
);
```

## Request Locals

Share state between preHandlers and route handlers:

```typescript
import { createLocalsPreHandler, getLocals } from '@typeful-api/fastify';

const dbPreHandler = createLocalsPreHandler<{ db: Database }>((request) => ({
  db: new Database(),
}));

// In your handler:
const handler = async ({ request }) => {
  const { db } = getLocals<{ db: Database }>(request);
  return await db.products.findMany();
};
```

## Handlers in Separate Files

Derive handler types from the contract:

```typescript
import type { InferFastifyHandlers } from '@typeful-api/fastify';
import type { api } from './api';

type AppHandlers = InferFastifyHandlers<typeof api>;
export type ProductHandlers = AppHandlers['v1']['products'];
```

```typescript
import type { ProductHandlers } from '../types';

export const list: ProductHandlers['list'] = async ({ request }) => {
  const { db } = getLocals<{ db: Database }>(request);
  return await db.products.findMany();
};
```

## Core Helpers

The `@typeful-api/core` package provides built-in helpers that work with any adapter:

```typescript
import { paginationQuery, paginated, sortQuery } from '@typeful-api/core';

// Pagination + sort + typed errors in one route definition
route
  .get('/')
  .query(paginationQuery().merge(sortQuery(['name', 'price'] as const)))
  .returns(paginated(ProductSchema))
  .withErrors(401);
```

See the [core package docs](https://www.npmjs.com/package/@typeful-api/core) for all pagination and error helpers.

## API

| Export                                    | Description                                        |
| ----------------------------------------- | -------------------------------------------------- |
| `createFastifyPlugin(contract, handlers)` | Create a typed Fastify plugin from an API contract |
| `composePreHandlers(...hooks)`            | Compose multiple preHandler hooks                  |
| `conditionalPreHandler(pred, hook)`       | Apply preHandler conditionally                     |
| `createPreHandler(fn)`                    | Create a typed preHandler hook                     |
| `createLocalsPreHandler(fn)`              | Create a preHandler that populates request locals  |
| `decorateInstance(instance, key, value)`  | Type-safe Fastify instance decoration              |
| `getLocals(request)`                      | Get typed locals from the request                  |
| `setLocals(request, locals)`              | Set typed locals on the request                    |
| `mergeLocals(request, locals)`            | Merge typed locals into the request                |

## Type Utilities

| Export                      | Description                              |
| --------------------------- | ---------------------------------------- |
| `InferFastifyHandlers`      | Infer handler types from a contract      |
| `InferFastifyGroupHandlers` | Infer handler types for a specific group |
| `FastifyRouteContext`       | Typed context passed to handlers         |
| `RequestWithLocals`         | Fastify request with typed locals        |

## Documentation

For full documentation, examples, and guides, visit the [typeful-api repository](https://github.com/dobosmarton/typeful-api).

## License

MIT
