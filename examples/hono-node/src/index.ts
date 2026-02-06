/**
 * Hono Node.js Example — Separate Handlers Pattern
 *
 * Demonstrates how to define API handlers in separate files
 * with full type safety derived from the contract.
 *
 * Type flow: api.ts (contract) → types.ts (derived types) → handlers/*.ts (typed handlers)
 *
 * Run with: npm run dev
 */

import { serve } from '@hono/node-server';
import { createHonoRouter } from '@typefulapi/hono';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { api, type Product } from './api';
import { health } from './handlers/health';
import * as products from './handlers/products';
import type { AppEnv, AppVariables } from './types';

// ============================================
// In-Memory Database (for demo purposes)
// ============================================

const initialProducts: Product[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    name: 'TypeScript Handbook',
    description: 'Complete guide to TypeScript',
    price: 29.99,
    inStock: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    name: 'Node.js in Action',
    description: 'Learn Node.js the practical way',
    price: 39.99,
    inStock: true,
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
  c.set('products', initialProducts);
  await next();
};

// ============================================
// Router — handlers imported from separate files
// ============================================

const router = createHonoRouter<typeof api, AppVariables>(
  api,
  {
    v1: {
      health,
      products: {
        middlewares: [productsMiddleware],
        list: products.list,
        get: products.get,
        create: products.create,
        update: products.update,
        delete: products.deleteProduct,
      },
    },
  },
  {
    docsConfig: {
      info: {
        title: 'Hono Node.js Example API',
        version: '1.0.0',
      },
    },
  },
);

// ============================================
// Main App
// ============================================

const app = new Hono<AppEnv>();

// Global middleware
app.use('*', logger());
app.use('*', cors());

// Mount API router
app.route('/api', router);

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'Hono Node.js Example',
    version: '1.0.0',
    docs: '/api/api-doc',
  });
});

// ============================================
// Start Server
// ============================================

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
  console.log(`Health check: http://localhost:${info.port}/api/v1/health`);
  console.log(`Products API: http://localhost:${info.port}/api/v1/products`);
  console.log(`API Docs: http://localhost:${info.port}/api/api-doc`);
});
