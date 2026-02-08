# typeful-api

[![npm version](https://img.shields.io/npm/v/@typeful-api/core.svg)](https://www.npmjs.com/package/@typeful-api/core)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

End-to-end type-safe OpenAPI-first APIs with minimal boilerplate.

Define your API contract once with Zod schemas, get full type inference for handlers, and generate OpenAPI specs automatically. Works with **Hono**, **Express**, and **Fastify**.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Framework Adapters](#framework-adapters)
- [Route Builder API](#route-builder-api)
- [Pagination & Filtering Helpers](#pagination--filtering-helpers)
- [API Versioning](#api-versioning)
- [Middleware](#middleware)
- [Error Handling](#error-handling)
- [Authentication](#authentication)
- [CLI Commands](#cli-commands)
- [Comparison](#comparison)
- [Packages](#packages)
- [Resources](#resources)

## Features

- 🔒 **Full Type Safety**: From Zod schemas to handler implementations
- 📝 **OpenAPI First**: Auto-generate valid OpenAPI 3.0 specs
- 🔌 **Framework Agnostic**: Hono, Express, and Fastify adapters
- 🎯 **Minimal Boilerplate**: Define a CRUD API in ~30 lines
- 🏗️ **Hierarchical Middleware**: Apply middleware at version, group, or route level
- 📦 **First-class API Versioning**: v1, v2, etc. built into the design
- 📄 **Pagination & Filtering**: Built-in schema factories for offset, cursor, and sort patterns
- ⚠️ **Typed Error Responses**: Pre-built error schemas with `.withErrors()` shorthand
- 🔧 **CLI Tools**: Generate specs, client types, and scaffold new projects

## Prerequisites

- **Node.js** 20+ or **Bun** 1.0+
- **TypeScript** 5.5+ with strict mode enabled
- **Package manager**: npm, pnpm, yarn, or bun
- One of: **Hono**, **Express**, or **Fastify**

## Quick Start

### 1. Install

```bash
# Core package (required)
pnpm add @typeful-api/core zod

# Pick your framework adapter
pnpm add @typeful-api/hono hono @hono/zod-openapi
# or
pnpm add @typeful-api/express express
# or
pnpm add @typeful-api/fastify fastify

# Optional: CLI for spec generation
pnpm add -D @typeful-api/cli
```

### 2. Minimal Example

Here's the simplest possible API to get started:

```typescript
// src/api.ts
import { defineApi, route } from '@typeful-api/core';
import { z } from 'zod';

export const api = defineApi({
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

```typescript
// src/server.ts
import { Hono } from 'hono';
import { createHonoRouter } from '@typeful-api/hono';
import { api } from './api';

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

Run with `bun run src/server.ts` or `npx tsx src/server.ts`, then visit `http://localhost:3000/api/v1/hello`.

### 3. Full CRUD Example

For a more complete example with schemas, params, and authentication:

```typescript
// src/api.ts
import { defineApi, route } from '@typeful-api/core';
import { z } from 'zod';

// Define your schemas
const ProductSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  price: z.number().positive(),
});

const CreateProductSchema = ProductSchema.omit({ id: true });

const IdParamsSchema = z.object({
  id: z.uuid(),
});

// Define your API contract
export const api = defineApi({
  v1: {
    children: {
      products: {
        routes: {
          list: route.get('/').returns(z.array(ProductSchema)).withSummary('List all products'),

          get: route
            .get('/:id')
            .params(IdParamsSchema)
            .returns(ProductSchema)
            .withSummary('Get a product by ID'),

          create: route
            .post('/')
            .body(CreateProductSchema)
            .returns(ProductSchema)
            .withAuth('bearer')
            .withSummary('Create a new product'),

          delete: route
            .delete('/:id')
            .params(IdParamsSchema)
            .returns(z.object({ success: z.boolean() }))
            .withAuth('bearer')
            .withSummary('Delete a product'),
        },
      },
    },
  },
});
```

### 4. Implement Handlers (Hono)

```typescript
// src/server.ts
import { Hono, HTTPException } from 'hono';
import { createHonoRouter } from '@typeful-api/hono';
import { api } from './api';

// Define environment types
type ProductsEnv = {
  Bindings: { DATABASE_URL: string };
  Variables: { db: Database };
};

type Envs = {
  v1: {
    products: ProductsEnv;
  };
};

// Create router with fully typed handlers
const router = createHonoRouter<typeof api, Envs>(api, {
  v1: {
    products: {
      list: async ({ c }) => {
        const db = c.get('db');
        return await db.products.findMany();
      },

      get: async ({ c, params }) => {
        const db = c.get('db');
        const product = await db.products.find(params.id);
        if (!product) throw new HTTPException(404);
        return product;
      },

      create: async ({ c, body }) => {
        const db = c.get('db');
        return await db.products.create({
          id: crypto.randomUUID(),
          ...body,
        });
      },

      delete: async ({ c, params }) => {
        const db = c.get('db');
        await db.products.delete(params.id);
        return { success: true };
      },
    },
  },
});

const app = new Hono();
app.route('/api', router);

export default app;
```

### 5. Handlers in Separate Files

As your API grows, you'll want handlers in their own files. typeful-api makes this easy — derive handler types from the contract and use them to type standalone functions:

```typescript
// src/types.ts — derive handler types from the contract
import type { InferHonoHandlersWithVars } from '@typeful-api/hono';
import type { api } from './api';

type AppHandlers = InferHonoHandlersWithVars<typeof api, { db: Database }>;

// Index into the handler map to get types for each group
export type ProductHandlers = AppHandlers['v1']['products'];
```

```typescript
// src/handlers/products.ts — fully typed, autocompletion works
import type { ProductHandlers } from '../types';

export const list: ProductHandlers['list'] = async ({ c }) => {
  const db = c.get('db');
  return await db.products.findMany();
};

export const get: ProductHandlers['get'] = async ({ c, params }) => {
  const db = c.get('db');
  const product = await db.products.find(params.id);
  if (!product) throw new HTTPException(404);
  return product;
};

export const create: ProductHandlers['create'] = async ({ c, body }) => {
  const db = c.get('db');
  return await db.products.create({ id: crypto.randomUUID(), ...body });
};
```

```typescript
// src/server.ts — import and wire up
import { createHonoRouter } from '@typeful-api/hono';
import { api } from './api';
import * as products from './handlers/products';

const router = createHonoRouter<typeof api, { db: Database }>(api, {
  v1: {
    products: {
      list: products.list,
      get: products.get,
      create: products.create,
      delete: products.deleteProduct,
    },
  },
});
```

The type flows automatically: **contract → `InferHonoHandlersWithVars` → indexed handler type → typed function**. Change a Zod schema and every handler's types update with it.

### 6. Run Your Server

```bash
# Using Bun
bun run src/server.ts

# Using Node.js with tsx
npx tsx src/server.ts

# Or add to package.json scripts
# "dev": "bun run --watch src/server.ts"
```

Your API is now available at:

- `GET /api/v1/products` - List all products
- `GET /api/v1/products/:id` - Get a product
- `POST /api/v1/products` - Create a product (requires auth)
- `DELETE /api/v1/products/:id` - Delete a product (requires auth)

### 7. Generate OpenAPI Spec

```bash
# Using CLI
typeful-api generate-spec \
  --contract ./src/api.ts \
  --out ./openapi.json \
  --title "My API" \
  --api-version "1.0.0"
```

## Framework Adapters

### Hono

```typescript
import { createHonoRouter, WithVariables } from '@typeful-api/hono';

// Compose context types
type BaseEnv = { Bindings: Env };
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
>(api, handlers);
```

### Express

```typescript
import { createExpressRouter, getLocals } from '@typeful-api/express';

const router = createExpressRouter(api, {
  v1: {
    middleware: [corsMiddleware],
    products: {
      middleware: [dbMiddleware],
      list: async ({ req }) => {
        const { db } = getLocals<{ db: Database }>(req);
        return await db.products.findMany();
      },
    },
  },
});

app.use('/api', router);
```

### Fastify

```typescript
import { createFastifyPlugin, getLocals } from '@typeful-api/fastify';

fastify.register(
  createFastifyPlugin(api, {
    v1: {
      preHandler: [dbPreHandler],
      products: {
        list: async ({ request }) => {
          const { db } = getLocals<{ db: Database }>(request);
          return await db.products.findMany();
        },
      },
    },
  }),
  { prefix: '/api' },
);
```

## Route Builder API

The `route` builder provides a fluent API for defining routes:

```typescript
import { route } from '@typeful-api/core';
import { z } from 'zod';

// GET request with query params
route
  .get('/search')
  .query(z.object({ q: z.string(), page: z.number().optional() }))
  .returns(SearchResultSchema)
  .withSummary('Search products');

// POST request with body and auth
route
  .post('/products')
  .body(CreateProductSchema)
  .returns(ProductSchema)
  .withAuth('bearer')
  .withTags('products', 'write')
  .withSummary('Create a product');

// With path params and typed error responses
route
  .get('/products/:id')
  .params(z.object({ id: z.uuid() }))
  .returns(ProductSchema)
  .withErrors(404, 401);

// Mark as deprecated
route.get('/legacy/products').returns(z.array(ProductSchema)).markDeprecated();
```

## Pagination & Filtering Helpers

Built-in Zod schema factories for common API patterns — no more copy-pasting pagination schemas across projects:

```typescript
import {
  paginationQuery,
  cursorQuery,
  sortQuery,
  paginated,
  cursorPaginated,
} from '@typeful-api/core';

// Offset-based pagination query: { page, limit }
const query = paginationQuery(); // defaults: page=1, limit=20, maxLimit=100
const customQuery = paginationQuery({ defaultLimit: 50, maxLimit: 200 });

// Cursor-based pagination query: { cursor?, limit }
const cursor = cursorQuery();

// Sort query with allowed fields: { sortBy?, sortOrder? }
const sort = sortQuery(['name', 'createdAt', 'price'] as const);

// Paginated response wrapper: { items: T[], total, page, limit, totalPages }
const listRoute = route.get('/').query(paginationQuery()).returns(paginated(ProductSchema));

// Cursor-based response: { items: T[], nextCursor, hasMore }
const feedRoute = route.get('/feed').query(cursorQuery()).returns(cursorPaginated(PostSchema));
```

All query helpers use `z.coerce.number()` for automatic HTTP query string conversion, so `?page=2&limit=10` works out of the box. The generated OpenAPI spec includes all defaults and constraints.

## API Versioning

Version your API with automatic path prefixing:

```typescript
const api = defineApi({
  v1: {
    children: {
      products: { routes: v1ProductRoutes },
    },
  },
  v2: {
    children: {
      products: { routes: v2ProductRoutes },
    },
  },
});

// Results in:
// GET /api/v1/products
// GET /api/v2/products
```

## Middleware

Apply middleware at different levels:

```typescript
const router = createHonoRouter(api, {
  v1: {
    middlewares: [corsMiddleware], // All v1 routes
    products: {
      middlewares: [dbMiddleware], // All product routes
      list: handler,
      create: handler,
    },
    admin: {
      middlewares: [authMiddleware], // All admin routes
      users: {
        middlewares: [adminOnlyMiddleware], // All user admin routes
        list: handler,
      },
    },
  },
});
```

## Error Handling

typeful-api automatically validates requests against your Zod schemas. Invalid requests return a `400 Bad Request` with validation details.

### Validation Errors

When a request fails validation, the response includes:

```json
{
  "success": false,
  "error": {
    "issues": [
      {
        "code": "invalid_type",
        "expected": "string",
        "received": "undefined",
        "path": ["name"],
        "message": "Required"
      }
    ]
  }
}
```

### Built-in Error Schemas

Use `.withErrors()` to add typed error responses with a single method call:

```typescript
// Add 404 and 401 error responses — schemas and OpenAPI descriptions are automatic
route
  .get('/:id')
  .params(IdParamsSchema)
  .returns(ProductSchema)
  .withErrors(404, 401)
  .withSummary('Get a product');
```

Supported status codes: `400`, `401`, `403`, `404`, `409`, `422`, `429`, `500`.

Each error schema uses `z.literal()` codes (e.g., `'NOT_FOUND'`) for client-side discriminated unions. You can also use the individual factories directly:

```typescript
import { notFoundError, commonErrors, errorSchema } from '@typeful-api/core';

// Use pre-built error schemas with .withResponses()
route.get('/:id').returns(ProductSchema).withResponses({
  404: notFoundError(),
  401: unauthorizedError(),
});

// Or batch them with commonErrors()
route.get('/:id').returns(ProductSchema).withResponses(commonErrors(404, 401));

// Create custom error schemas
const RateLimitError = errorSchema('RATE_LIMITED', 'Too many requests');
```

### Custom Error Responses

For fully custom error shapes, use `.withResponses()` directly:

```typescript
const NotFoundError = z.object({
  error: z.literal('not_found'),
  message: z.string(),
});

route
  .get('/:id')
  .params(IdParamsSchema)
  .returns(ProductSchema)
  .withResponses({ 404: NotFoundError })
  .withSummary('Get a product');
```

### Throwing Errors in Handlers

Use framework-specific exceptions:

```typescript
// Hono
import { HTTPException } from 'hono';

get: async ({ c, params }) => {
  const product = await db.products.find(params.id);
  if (!product) {
    throw new HTTPException(404, { message: 'Product not found' });
  }
  return product;
};
```

## Authentication

The `.withAuth()` method marks routes as requiring authentication and documents this in the OpenAPI spec.

### Defining Protected Routes

```typescript
route
  .post('/products')
  .body(CreateProductSchema)
  .returns(ProductSchema)
  .withAuth('bearer') // Requires Bearer token
  .withSummary('Create a product');
```

### Implementing Auth Middleware

Authentication is handled through middleware, giving you full control:

```typescript
// Hono example
import { bearerAuth } from 'hono/bearer-auth';

const authMiddleware = bearerAuth({ token: process.env.API_TOKEN });

const router = createHonoRouter(api, {
  v1: {
    middlewares: [authMiddleware], // Apply to all v1 routes
    products: {
      list: handler, // Public (if not marked withAuth)
      create: handler, // Protected by middleware
    },
  },
});
```

### Auth Types

- `'bearer'` - Bearer token authentication
- `'basic'` - Basic HTTP authentication
- `'apiKey'` - API key in header or query

These map to OpenAPI security schemes in the generated spec.

## CLI Commands

```bash
# Scaffold a new project from a template
typeful-api init --template hono
typeful-api init --template express --dir ./my-api --name my-api
typeful-api init --template fastify

# Generate OpenAPI spec from contract
typeful-api generate-spec \
  --contract ./src/api.ts \
  --out ./openapi.json \
  --title "My API" \
  --api-version "1.0.0" \
  --server https://api.example.com

# Generate TypeScript client types
typeful-api generate-client \
  --spec ./openapi.json \
  --out ./src/client.d.ts

# Watch mode for development
typeful-api generate-spec --contract ./src/api.ts --watch
```

The `init` command generates a ready-to-run project with `package.json`, `tsconfig.json`, typed API contract using pagination and error helpers, and a framework-specific server entry point. Available templates: `hono` (default), `express`, `fastify`.

## Comparison

|                             | \*\*typeful-api\*\*     | ts-rest                           | @hono/zod-openapi    | tRPC                              | Elysia                    |
| --------------------------- | ----------------------- | --------------------------------- | -------------------- | --------------------------------- | ------------------------- |
| **Approach**                | Contract-first          | Contract-first                    | Route-first          | Server-first RPC                  | Server-first              |
| **Validation**              | Zod                     | Zod / Valibot                     | Zod                  | Any (Zod common)                  | TypeBox / Standard Schema |
| **OpenAPI generation**      | ✅ Portable             | ✅ Portable                       | ✅ Portable          | ❌ Third-party only               | ✅ Via plugin             |
| **Framework support**       | Hono, Express, Fastify  | Express, Fastify, Next.js, NestJS | Hono only            | Express, Fastify, Next.js, Lambda | Bun only                  |
| **API versioning**          | ✅ First-class          | ❌ Manual                         | ❌ Manual            | ❌ Manual                         | ❌ Manual                 |
| **Hierarchical middleware** | ✅ Native               | ❌ Per-route only                 | ✅ Via Hono          | ✅ Type-safe pipes                | ✅ Guard system           |
| **Handler decoupling**      | ✅ Typed separate files | ✅ With caveats                   | ✅ Routes + handlers | ✅ Standard                       | ⚠️ Tricky (chaining)      |
| **Built-in client**         | ✅ CLI generation       | ✅ Fetch-based                    | ❌ Use external      | ✅ Type-inferred                  | ✅ Eden Treaty            |
| **REST / OpenAPI native**   | ✅                      | ✅                                | ✅                   | ❌ Custom RPC                     | ✅                        |

**How they differ:**

- **tRPC** is the most popular option for TypeScript monorepos, but uses a custom RPC protocol — not REST. If you need standard OpenAPI specs or non-TypeScript clients, tRPC requires third-party addons.
- **ts-rest** is the closest alternative to typeful-api. It shares the contract-first Zod approach but lacks built-in API versioning and hierarchical middleware.
- **@hono/zod-openapi** is excellent if you're committed to Hono. typeful-api builds on top of it for Hono and extends the same ideas to Express and Fastify.
- **Elysia** is a fast full framework with great DX, but locked to Bun and not contract-first.

## Packages

| Package                | Description                                                    |
| ---------------------- | -------------------------------------------------------------- |
| `@typeful-api/core`    | Framework-agnostic core with route builder and spec generation |
| `@typeful-api/hono`    | Hono adapter with OpenAPI integration                          |
| `@typeful-api/express` | Express adapter with validation middleware                     |
| `@typeful-api/fastify` | Fastify adapter with preHandler hooks                          |
| `@typeful-api/cli`     | CLI for spec and client generation                             |

## Resources

- [Examples](https://github.com/dobosmarton/typeful-api/tree/main/examples) - Full working examples for each framework
- [GitHub Issues](https://github.com/dobosmarton/typeful-api/issues) - Report bugs or request features
- [Changelog](https://github.com/dobosmarton/typeful-api/blob/main/CHANGELOG.md) - Version history and updates

## License

MIT
