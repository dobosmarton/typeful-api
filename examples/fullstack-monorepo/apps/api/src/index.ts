/**
 * Fullstack Monorepo API Server
 *
 * A Hono API server demonstrating typi with type-safe routes.
 * This API serves as the backend for the React + TanStack Query frontend.
 *
 * Run with: pnpm dev
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { randomUUID } from 'node:crypto';
import { swaggerUI } from '@hono/swagger-ui';
import { createHonoRouter, type SimpleEnv } from '@typefulapi/hono';
import { api, type Product } from './api';

// ============================================
// Environment Type
// ============================================

type AppVariables = {
  products: Product[];
};

// ============================================
// In-Memory Database (for demo purposes)
// ============================================

const products: Product[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    name: 'TypeScript Handbook',
    description: 'Complete guide to TypeScript',
    price: 2999,
    inStock: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    name: 'Node.js in Action',
    description: 'Learn Node.js the practical way',
    price: 3999,
    inStock: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440003',
    name: 'React Patterns',
    description: 'Advanced React design patterns',
    price: 4499,
    inStock: false,
    createdAt: new Date().toISOString(),
  },
];

// ============================================
// Middleware
// ============================================

const productsMiddleware = async (
  c: { set: (key: string, value: unknown) => void },
  next: () => Promise<void>,
) => {
  c.set('products', products);
  await next();
};

// ============================================
// Router
// ============================================

const router = createHonoRouter<typeof api, AppVariables>(
  api,
  {
    v1: {
      health: async () => ({
        status: 'ok' as const,
        timestamp: new Date().toISOString(),
      }),

      products: {
        middlewares: [productsMiddleware],

        list: async ({ c, query }) => {
          const allProducts = c.get('products');
          const { page, limit } = query;
          const start = (page - 1) * limit;
          const paginatedProducts = allProducts.slice(start, start + limit);

          return {
            products: paginatedProducts,
            total: allProducts.length,
            page,
            limit,
          };
        },

        get: async ({ c, params }) => {
          const allProducts = c.get('products');
          const product = allProducts.find((p) => p.id === params.id);

          if (!product) {
            throw new Error('Product not found');
          }

          return product;
        },

        create: async ({ c, body }) => {
          const allProducts = c.get('products');
          const newProduct: Product = {
            id: randomUUID(),
            ...body,
            createdAt: new Date().toISOString(),
          };

          allProducts.push(newProduct);
          return newProduct;
        },

        update: async ({ c, params, body }) => {
          const allProducts = c.get('products');
          const index = allProducts.findIndex((p) => p.id === params.id);

          if (index === -1) {
            throw new Error('Product not found');
          }

          const updated = { ...allProducts[index]!, ...body };
          allProducts[index] = updated;
          return updated;
        },

        delete: async ({ c, params }) => {
          const allProducts = c.get('products');
          const index = allProducts.findIndex((p) => p.id === params.id);

          if (index === -1) {
            throw new Error('Product not found');
          }

          allProducts.splice(index, 1);
          return { success: true };
        },
      },
    },
  },
  {
    docsConfig: {
      info: {
        title: 'Fullstack Monorepo API',
        version: '1.0.0',
      },
    },
  },
);

// ============================================
// Main App
// ============================================

const app = new Hono<SimpleEnv<AppVariables>>();

// Global middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  }),
);

// Mount API router
app.route('/api', router);

// Swagger UI — install @hono/swagger-ui and point it to the OpenAPI JSON endpoint
app.get('/api/api-reference', swaggerUI({ url: '/api/api-doc' }));

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'Fullstack Monorepo API',
    version: '1.0.0',
    docs: '/api/api-reference',
  });
});

// ============================================
// Start Server
// ============================================

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API server running at http://localhost:${info.port}`);
  console.log(`Health check: http://localhost:${info.port}/api/v1/health`);
  console.log(`Products API: http://localhost:${info.port}/api/v1/products`);
  console.log(`API Docs: http://localhost:${info.port}/api/api-reference`);
});
