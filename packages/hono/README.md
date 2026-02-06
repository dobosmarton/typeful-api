# @typeful-api/hono

[![npm version](https://img.shields.io/npm/v/@typeful-api/hono.svg)](https://www.npmjs.com/package/@typeful-api/hono)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Hono adapter for [typeful-api](https://github.com/dobosmarton/typeful-api) — build end-to-end type-safe OpenAPI-first APIs with Hono. Works on **Node.js**, **Cloudflare Workers**, **Deno**, **Bun**, and more.

## Installation

```bash
npm install @typeful-api/core @typeful-api/hono hono @hono/zod-openapi zod
```

## Quick Start

### 1. Define Your Contract

```typescript
import { defineApi, route } from '@typeful-api/core';
import { z } from 'zod';

const api = defineApi({
  v1: {
    children: {
      hello: {
        routes: {
          greet: route
            .get('/')
            .returns(z.object({ message: z.string() }))
            .withSummary('Say hello'),
        },
      },
    },
  },
});
```

### 2. Create a Router

```typescript
import { Hono } from 'hono';
import { createHonoRouter } from '@typeful-api/hono';

const router = createHonoRouter(api, {
  v1: {
    hello: {
      greet: async () => ({ message: 'Hello, World!' }),
    },
  },
});

const app = new Hono();
app.route('/api', router);

export default app;
```

## Typed Environment

Use `WithVariables` to compose context types for Hono's bindings and variables:

```typescript
import { createHonoRouter, WithVariables } from '@typeful-api/hono';

type BaseEnv = { Bindings: { DATABASE_URL: string } };
type WithDb = WithVariables<BaseEnv, { db: Database }>;
type WithAuth = WithVariables<WithDb, { user: User }>;

const router = createHonoRouter<
  typeof api,
  {
    v1: {
      products: WithDb;
      users: WithAuth;
    };
  }
>(api, {
  v1: {
    products: {
      list: async ({ c }) => {
        const db = c.get('db');
        return await db.products.findMany();
      },
    },
  },
});
```

## Hierarchical Middleware

Apply middleware at version, group, or route level:

```typescript
const router = createHonoRouter(api, {
  v1: {
    middlewares: [corsMiddleware], // All v1 routes
    products: {
      middlewares: [dbMiddleware], // All product routes
      list: handler,
      create: handler,
    },
  },
});
```

## Handlers in Separate Files

Derive handler types from the contract for type-safe standalone handler files:

```typescript
import type { InferHonoHandlersWithVars } from '@typeful-api/hono';
import type { api } from './api';

type AppHandlers = InferHonoHandlersWithVars<typeof api, { db: Database }>;
export type ProductHandlers = AppHandlers['v1']['products'];
```

```typescript
import type { ProductHandlers } from '../types';

export const list: ProductHandlers['list'] = async ({ c }) => {
  const db = c.get('db');
  return await db.products.findMany();
};
```

## API

| Export                                 | Description                                     |
| -------------------------------------- | ----------------------------------------------- |
| `createHonoRouter(contract, handlers)` | Create a typed Hono router from an API contract |
| `createHonoRegistry()`                 | Create an OpenAPI registry for spec generation  |
| `composeMiddleware(...mw)`             | Compose multiple Hono middlewares               |
| `conditionalMiddleware(pred, mw)`      | Apply middleware conditionally                  |
| `createTypedMiddleware(fn)`            | Create middleware with typed context            |
| `createVariableMiddleware(fn)`         | Create middleware that sets context variables   |
| `getVariables(c)`                      | Get typed variables from Hono context           |

## Type Utilities

| Export                      | Description                                  |
| --------------------------- | -------------------------------------------- |
| `InferHonoHandlers`         | Infer handler types from a contract          |
| `InferHonoGroupHandlers`    | Infer handler types for a specific group     |
| `InferHonoHandlersWithVars` | Infer handlers with shared context variables |
| `WithVariables<Env, Vars>`  | Compose Hono environment types               |

## Documentation

For full documentation, examples, and guides, visit the [typeful-api repository](https://github.com/dobosmarton/typeful-api).

## License

MIT
