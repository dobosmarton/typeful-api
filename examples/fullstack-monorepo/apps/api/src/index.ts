/**
 * Fullstack Monorepo API Server
 *
 * A Hono API server demonstrating typi with type-safe routes.
 * This API serves as the backend for the React + TanStack Query frontend.
 *
 * Run with: pnpm dev
 */

import { serve } from '@hono/node-server';
import { swaggerUI } from '@hono/swagger-ui';
import { createHonoRouter, type SimpleEnv } from '@typeful-api/hono';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { randomUUID } from 'node:crypto';
import { api, type Product, type Category } from './api';

// ============================================
// Environment Type
// ============================================

type AppVariables = {
  products: Product[];
  categories: Category[];
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

const categories: Category[] = [
  {
    id: '770e8400-e29b-41d4-a716-446655440001',
    name: 'Programming',
    slug: 'programming',
    description: 'Books about programming languages and paradigms',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: '770e8400-e29b-41d4-a716-446655440002',
    name: 'Web Development',
    slug: 'web-development',
    description: 'Frontend and backend web technologies',
    createdAt: '2025-01-02T00:00:00.000Z',
  },
  {
    id: '770e8400-e29b-41d4-a716-446655440003',
    name: 'DevOps',
    slug: 'devops',
    description: 'Infrastructure, CI/CD, and deployment',
    createdAt: '2025-01-03T00:00:00.000Z',
  },
];

// ============================================
// Helper: Slug generation
// ============================================

const toSlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

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

const categoriesMiddleware = async (
  c: { set: (key: string, value: unknown) => void },
  next: () => Promise<void>,
) => {
  c.set('categories', categories);
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
          const { page, limit, sortBy, sortOrder } = query;

          // Sort
          const sorted = [...allProducts].sort((a, b) => {
            const field = sortBy ?? 'createdAt';
            const aVal = a[field];
            const bVal = b[field];
            const cmp =
              typeof aVal === 'number' && typeof bVal === 'number'
                ? aVal - bVal
                : String(aVal).localeCompare(String(bVal));
            return sortOrder === 'desc' ? -cmp : cmp;
          });

          // Paginate
          const start = (page - 1) * limit;
          const pageItems = sorted.slice(start, start + limit);

          return {
            items: pageItems,
            total: allProducts.length,
            page,
            limit,
            totalPages: Math.ceil(allProducts.length / limit),
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

      categories: {
        middlewares: [categoriesMiddleware],

        list: async ({ c, query }) => {
          const allCategories = c.get('categories');
          const { cursor, limit } = query;

          // Sort by createdAt desc
          const sorted = [...allCategories].sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );

          // Find cursor position
          const startIndex = cursor
            ? sorted.findIndex((cat) => cat.id === cursor) + 1
            : 0;

          // Take limit + 1 to check for more
          const slice = sorted.slice(startIndex, startIndex + limit + 1);
          const hasMore = slice.length > limit;
          const pageItems = hasMore ? slice.slice(0, limit) : slice;
          const nextCursor = hasMore
            ? pageItems[pageItems.length - 1]!.id
            : null;

          return { items: pageItems, nextCursor, hasMore };
        },

        get: async ({ c, params }) => {
          const allCategories = c.get('categories');
          const category = allCategories.find((cat) => cat.id === params.id);

          if (!category) {
            throw new Error('Category not found');
          }

          return category;
        },

        create: async ({ c, body }) => {
          const allCategories = c.get('categories');
          const newCategory: Category = {
            id: randomUUID(),
            slug: toSlug(body.name),
            createdAt: new Date().toISOString(),
            ...body,
          };

          allCategories.push(newCategory);
          return newCategory;
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
  console.log(`Categories API: http://localhost:${info.port}/api/v1/categories`);
  console.log(`API Docs: http://localhost:${info.port}/api/api-doc`);
  console.log(`Swagger UI: http://localhost:${info.port}/api/api-reference`);
});
