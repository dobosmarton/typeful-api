/**
 * Fastify Auth Example
 *
 * A complete example demonstrating typefulapi with Fastify.
 * This example includes:
 * - Type-safe route handlers
 * - Request validation via preHandlers
 * - OpenAPI documentation endpoint
 * - In-memory database simulation
 *
 * Run with: pnpm dev
 */

import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { createFastifyPlugin } from '@typefulapi/fastify';
import { api, type Product } from './api';

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
// Plugin
// ============================================

const plugin = createFastifyPlugin(
  api,
  {
    v1: {
      // Version-level routes
      health: async () => ({
        status: 'ok' as const,
        timestamp: new Date().toISOString(),
      }),

      // Products group
      products: {
        list: async ({ query }) => {
          const { page, limit } = query;
          const start = (page - 1) * limit;
          const paginatedProducts = products.slice(start, start + limit);

          return {
            products: paginatedProducts,
            total: products.length,
            page,
            limit,
          };
        },

        get: async ({ params }) => {
          const product = products.find((p) => p.id === params.id);

          if (!product) {
            throw new Error('Product not found');
          }

          return product;
        },

        create: async ({ body }) => {
          const newProduct: Product = {
            id: randomUUID(),
            ...body,
            createdAt: new Date().toISOString(),
          };

          products.push(newProduct);
          return newProduct;
        },

        update: async ({ params, body }) => {
          const index = products.findIndex((p) => p.id === params.id);

          if (index === -1) {
            throw new Error('Product not found');
          }

          const updated = { ...products[index]!, ...body };
          products[index] = updated;
          return updated;
        },

        delete: async ({ params }) => {
          const index = products.findIndex((p) => p.id === params.id);

          if (index === -1) {
            throw new Error('Product not found');
          }

          products.splice(index, 1);
          return { success: true };
        },
      },
    },
  },
  {
    docsConfig: {
      info: {
        title: 'Fastify Auth Example API',
        version: '1.0.0',
      },
    },
  },
);

// ============================================
// Main App
// ============================================

const fastify = Fastify({ logger: true });

// Register API plugin
fastify.register(plugin, { prefix: '/api' });

// Root endpoint
fastify.get('/', async () => {
  return {
    name: 'Fastify Auth Example',
    version: '1.0.0',
    docs: '/api/api-doc',
  };
});

// ============================================
// Start Server
// ============================================

const port = Number(process.env.PORT) || 3000;

fastify.listen({ port, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log(`Server running at ${address}`);
  console.log(`Health check: ${address}/api/v1/health`);
  console.log(`Products API: ${address}/api/v1/products`);
  console.log(`API Docs: ${address}/api/api-doc`);
});
