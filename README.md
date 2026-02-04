# typi

End-to-end type-safe OpenAPI-first APIs with minimal boilerplate.

Define your API contract once with Zod schemas, get full type inference for handlers, and generate OpenAPI specs automatically. Works with **Hono**, **Express**, and **Fastify**.

## Features

- 🔒 **Full Type Safety**: From Zod schemas to handler implementations
- 📝 **OpenAPI First**: Auto-generate valid OpenAPI 3.0 specs
- 🔌 **Framework Agnostic**: Hono, Express, and Fastify adapters
- 🎯 **Minimal Boilerplate**: Define a CRUD API in ~30 lines
- 🏗️ **Hierarchical Middleware**: Apply middleware at version, group, or route level
- 📦 **First-class API Versioning**: v1, v2, etc. built into the design
- 🔧 **CLI Tools**: Generate specs and client types from the command line

## Quick Start

### 1. Install

```bash
# Core package (required)
pnpm add @typi/core zod

# Pick your framework adapter
pnpm add @typi/hono hono @hono/zod-openapi
# or
pnpm add @typi/express express
# or
pnpm add @typi/fastify fastify

# Optional: CLI for spec generation
pnpm add -D @typi/cli
```

### 2. Define Your API Contract

```typescript
// src/api.ts
import { defineApi, route } from '@typi/core';
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

### 3. Implement Handlers (Hono)

```typescript
// src/server.ts
import { Hono } from 'hono';
import { createHonoRouter } from '@typi/hono';
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

### 4. Generate OpenAPI Spec

```bash
# Using CLI
typi generate-spec \
  --contract ./src/api.ts \
  --out ./openapi.json \
  --title "My API" \
  --api-version "1.0.0"
```

## Framework Adapters

### Hono

```typescript
import { createHonoRouter, WithVariables } from '@typi/hono';

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
import { createExpressRouter, getLocals } from '@typi/express';

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
import { createFastifyPlugin, getLocals } from '@typi/fastify';

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
import { route } from '@typi/core';
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
  .params(z.object({ id: z.uuid() }))
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

## CLI Commands

```bash
# Generate OpenAPI spec from contract
typi generate-spec \
  --contract ./src/api.ts \
  --out ./openapi.json \
  --title "My API" \
  --api-version "1.0.0" \
  --server https://api.example.com

# Generate TypeScript client types
typi generate-client \
  --spec ./openapi.json \
  --out ./src/client.d.ts

# Watch mode for development
typi generate-spec --contract ./src/api.ts --watch
```

## Comparison

| Feature | ts-rest | @hono/zod-openapi | Zodios | **typi** |
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
| `@typi/core` | Framework-agnostic core with route builder and spec generation |
| `@typi/hono` | Hono adapter with OpenAPI integration |
| `@typi/express` | Express adapter with validation middleware |
| `@typi/fastify` | Fastify adapter with preHandler hooks |
| `@typi/cli` | CLI for spec and client generation |

## License

MIT
