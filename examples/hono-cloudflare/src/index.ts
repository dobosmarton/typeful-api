/**
 * Hono Basic Example
 *
 * A complete example demonstrating typi with Hono.
 * This example includes:
 * - Type-safe route handlers
 * - Middleware composition
 * - In-memory database simulation
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { createHonoRouter, type WithVariables } from '@typefulapi/hono';
import { api, type Product } from './api';

// ============================================
// Environment Types
// ============================================

type Env = {
  JWT_SECRET: string;
};

type BaseEnv = { Bindings: Env };
type ProductsEnv = WithVariables<BaseEnv, { products: Product[] }>;

type EnvMap = {
  v1: {
    products: ProductsEnv;
  };
};

// ============================================
// In-Memory Database (for demo purposes)
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

// Middleware to inject products "database" into context
const productsMiddleware = async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
  c.set('products', products);
  await next();
};

// ============================================
// Router
// ============================================

const router = createHonoRouter<typeof api, EnvMap>(api, {
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
          id: crypto.randomUUID(),
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

const app = new Hono<BaseEnv>();

// Global middleware
app.use('*', logger());
app.use('*', cors());

// Mount API router
app.route('/api', router);

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'Hono Basic Example',
    version: '1.0.0',
    docs: '/api/v1/health',
  });
});

export default app;
