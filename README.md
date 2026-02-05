# typefulapi

[![npm version](https://img.shields.io/npm/v/@typefulapi/core.svg)](https://www.npmjs.com/package/@typefulapi/core)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

End-to-end type-safe OpenAPI-first APIs with minimal boilerplate.

Define your API contract once with Zod schemas, get full type inference for handlers, and generate OpenAPI specs automatically. Works with **Hono**, **Express**, and **Fastify**.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Framework Adapters](#framework-adapters)
- [Route Builder API](#route-builder-api)
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
- 🔧 **CLI Tools**: Generate specs and client types from the command line

## Prerequisites

- **Node.js** 18+ or **Bun** 1.0+
- **TypeScript** 5.0+ with strict mode enabled
- **Package manager**: npm, pnpm, yarn, or bun
- One of: **Hono**, **Express**, or **Fastify**

## Quick Start

### 1. Install

```bash
# Core package (required)
pnpm add @typefulapi/core zod

# Pick your framework adapter
pnpm add @typefulapi/hono hono @hono/zod-openapi
# or
pnpm add @typefulapi/express express
# or
pnpm add @typefulapi/fastify fastify

# Optional: CLI for spec generation
pnpm add -D @typefulapi/cli
```

### 2. Minimal Example

Here's the simplest possible API to get started:

```typescript
// src/api.ts
import { defineApi, route } from '@typefulapi/core';
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
import { createHonoRouter } from '@typefulapi/hono';
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
import { defineApi, route } from '@typefulapi/core';
import { z } from 'zod';

// Define your schemas
const ProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  price: z.number().positive(),
});

const CreateProductSchema = ProductSchema.omit({ id: true });

const IdParamsSchema = z.object({
  id: z.string().uuid(),
});

// Define your API contract
export const api = defineApi({
  v1: {
    children: {
      products: {
        routes: {
          list: route
            .get('/')
            .returns(z.array(ProductSchema))
            .withSummary('List all products'),

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
import { createHonoRouter } from '@typefulapi/hono';
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

### 5. Run Your Server

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

### 6. Generate OpenAPI Spec

```bash
# Using CLI
typefulapi generate-spec \
  --contract ./src/api.ts \
  --out ./openapi.json \
  --title "My API" \
  --api-version "1.0.0"
```

## Framework Adapters

### Hono

```typescript
import { createHonoRouter, WithVariables } from '@typefulapi/hono';

// Compose context types
type BaseEnv = { Bindings: Env };
type WithDb = WithVariables<BaseEnv, { db: Database }>;
type WithAuth = WithVariables<WithDb, { user: User }>;

const router = createHonoRouter<typeof api, {
  v1: {
    products: WithDb;
    users: WithAuth;
  };
}>(api, handlers);
```

### Express

```typescript
import { createExpressRouter, getLocals } from '@typefulapi/express';

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
import { createFastifyPlugin, getLocals } from '@typefulapi/fastify';

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
  { prefix: '/api' }
);
```

## Route Builder API

The `route` builder provides a fluent API for defining routes:

```typescript
import { route } from '@typefulapi/core';
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

// With path params
route
  .get('/products/:id')
  .params(z.object({ id: z.string().uuid() }))
  .returns(ProductSchema);

// Mark as deprecated
route
  .get('/legacy/products')
  .returns(z.array(ProductSchema))
  .markDeprecated();
```

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

typefulapi automatically validates requests against your Zod schemas. Invalid requests return a `400 Bad Request` with validation details.

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

### Custom Error Responses

Define error response schemas in your routes:

```typescript
const NotFoundError = z.object({
  error: z.literal('not_found'),
  message: z.string(),
});

route
  .get('/:id')
  .params(IdParamsSchema)
  .returns(ProductSchema)
  .errors({ 404: NotFoundError })
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
}
```

## Authentication

The `.withAuth()` method marks routes as requiring authentication and documents this in the OpenAPI spec.

### Defining Protected Routes

```typescript
route
  .post('/products')
  .body(CreateProductSchema)
  .returns(ProductSchema)
  .withAuth('bearer')  // Requires Bearer token
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
      list: handler,   // Public (if not marked withAuth)
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
# Generate OpenAPI spec from contract
typefulapi generate-spec \
  --contract ./src/api.ts \
  --out ./openapi.json \
  --title "My API" \
  --api-version "1.0.0" \
  --server https://api.example.com

# Generate TypeScript client types
typefulapi generate-client \
  --spec ./openapi.json \
  --out ./src/client.d.ts

# Watch mode for development
typefulapi generate-spec --contract ./src/api.ts --watch
```

## Comparison

| Feature | ts-rest | @hono/zod-openapi | Zodios | **typefulapi** |
|---------|---------|-------------------|--------|------------------|
| API Versioning | ❌ | ❌ | ❌ | ✅ First-class |
| Handler Decoupling | Partial | ❌ | ❌ | ✅ Full |
| Hierarchical Middleware | ❌ | ❌ | ❌ | ✅ Native |
| Client Generation | Built-in | Manual | Built-in | ✅ Automatic |
| OpenAPI Portable | ❌ | ✅ | ✅ | ✅ |
| Framework Agnostic | Partial | ❌ | ❌ | ✅ Hono/Express/Fastify |

## Packages

| Package | Description |
|---------|-------------|
| `@typefulapi/core` | Framework-agnostic core with route builder and spec generation |
| `@typefulapi/hono` | Hono adapter with OpenAPI integration |
| `@typefulapi/express` | Express adapter with validation middleware |
| `@typefulapi/fastify` | Fastify adapter with preHandler hooks |
| `@typefulapi/cli` | CLI for spec and client generation |

## Resources

- [Examples Repository](https://github.com/typefulapi/examples) - Full working examples for each framework
- [API Reference](https://typefulapi.dev/docs) - Detailed API documentation
- [GitHub Issues](https://github.com/typefulapi/typefulapi/issues) - Report bugs or request features
- [Changelog](https://github.com/typefulapi/typefulapi/blob/main/CHANGELOG.md) - Version history and updates

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) before submitting a PR.

## License

MIT
