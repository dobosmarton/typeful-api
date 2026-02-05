/**
 * Hono Docker Example
 *
 * A production-ready example demonstrating typi with Hono in Docker.
 * This example uses the simplified API without Cloudflare bindings.
 *
 * Build: docker build -t hono-docker-example .
 * Run: docker run -p 3000:3000 hono-docker-example
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { randomUUID } from 'node:crypto';
import { createHonoRouter, type SimpleEnv } from '@typefulapi/hono';
import { api, type Product } from './api';

// ============================================
// Environment Type (simplified - no Bindings)
// ============================================

type AppVariables = {
  products: Product[];
};

// ============================================
// In-Memory Database (for demo purposes)
// In production, replace with a real database
// ============================================

const products: Product[] = [
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
    name: 'Docker in Practice',
    description: 'Containerization made simple',
    price: 44.99,
    inStock: true,
    createdAt: new Date().toISOString(),
  },
];

// ============================================
// Middleware
// ============================================

// Middleware to inject products "database" into context
const productsMiddleware = async (
  c: { set: (key: string, value: unknown) => void },
  next: () => Promise<void>,
) => {
  c.set('products', products);
  await next();
};

// ============================================
// Router (using simplified API)
// ============================================

const router = createHonoRouter<typeof api, AppVariables>(api, {
  v1: {
    // Version-level routes
    health: async () => ({
      status: 'ok' as const,
      timestamp: new Date().toISOString(),
    }),

    // Products group
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
});

// ============================================
// Main App
// ============================================

const app = new Hono<SimpleEnv<AppVariables>>();

// Global middleware
app.use('*', logger());
app.use('*', cors());

// Mount API router
app.route('/api', router);

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'Hono Docker Example',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    docs: '/api/v1/health',
  });
});

// ============================================
// Start Server
// ============================================

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[${new Date().toISOString()}] Server started`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Listening: http://0.0.0.0:${info.port}`);
  console.log(`  Health: http://localhost:${info.port}/api/v1/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SIGTERM] Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[SIGINT] Shutting down gracefully...');
  process.exit(0);
});
