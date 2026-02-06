# @typeful-api/express

[![npm version](https://img.shields.io/npm/v/@typeful-api/express.svg)](https://www.npmjs.com/package/@typeful-api/express)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Express adapter for [typeful-api](https://github.com/dobosmarton/typeful-api) — build end-to-end type-safe OpenAPI-first APIs with Express. Compatible with **Express 4.x** and **5.x**.

## Installation

```bash
npm install @typeful-api/core @typeful-api/express express zod
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

### 2. Create a Router

```typescript
import express from 'express';
import { createExpressRouter, getLocals } from '@typeful-api/express';

const router = createExpressRouter(api, {
  v1: {
    products: {
      list: async ({ req }) => {
        const { db } = getLocals<{ db: Database }>(req);
        return await db.products.findMany();
      },
      create: async ({ req, body }) => {
        const { db } = getLocals<{ db: Database }>(req);
        return await db.products.create({ id: crypto.randomUUID(), ...body });
      },
    },
  },
});

const app = express();
app.use('/api', router);
app.listen(3000);
```

## Hierarchical Middleware

Apply middleware at version, group, or route level:

```typescript
const router = createExpressRouter(api, {
  v1: {
    middleware: [corsMiddleware], // All v1 routes
    products: {
      middleware: [dbMiddleware], // All product routes
      list: handler,
      create: handler,
    },
  },
});
```

## Request Locals

Share state between middleware and handlers using typed `res.locals`:

```typescript
import { createLocalsMiddleware, getLocals } from '@typeful-api/express';

const dbMiddleware = createLocalsMiddleware<{ db: Database }>((_req, _res) => ({
  db: new Database(),
}));

// In your handler:
const handler = async ({ req }) => {
  const { db } = getLocals<{ db: Database }>(req);
  return await db.products.findMany();
};
```

## Handlers in Separate Files

Derive handler types from the contract:

```typescript
import type { InferExpressHandlers } from '@typeful-api/express';
import type { api } from './api';

type AppHandlers = InferExpressHandlers<typeof api>;
export type ProductHandlers = AppHandlers['v1']['products'];
```

```typescript
import type { ProductHandlers } from '../types';

export const list: ProductHandlers['list'] = async ({ req }) => {
  const { db } = getLocals<{ db: Database }>(req);
  return await db.products.findMany();
};
```

## API

| Export                                    | Description                                        |
| ----------------------------------------- | -------------------------------------------------- |
| `createExpressRouter(contract, handlers)` | Create a typed Express router from an API contract |
| `composeMiddleware(...mw)`                | Compose multiple Express middlewares               |
| `conditionalMiddleware(pred, mw)`         | Apply middleware conditionally                     |
| `createTypedMiddleware(fn)`               | Create middleware with typed request/response      |
| `createLocalsMiddleware(fn)`              | Create middleware that populates `res.locals`      |
| `createErrorHandler(fn)`                  | Create a typed error handler                       |
| `getLocals(req)`                          | Get typed locals from the request                  |

## Type Utilities

| Export                      | Description                                    |
| --------------------------- | ---------------------------------------------- |
| `InferExpressHandlers`      | Infer handler types from a contract            |
| `InferExpressGroupHandlers` | Infer handler types for a specific group       |
| `TypedRequest`              | Express request with typed params, query, body |
| `TypedResponse`             | Express response with typed locals             |
| `WithLocals<Locals>`        | Type helper for request locals                 |

## Documentation

For full documentation, examples, and guides, visit the [typeful-api repository](https://github.com/dobosmarton/typeful-api).

## License

MIT
