/**
 * Orders Service
 *
 * A Hono service that owns orders. Its API is described at /api/api-doc, which is all other
 * services need to call it (see ../checkout-service).
 *
 * Run with: pnpm dev (port 3001)
 */

import { serve } from '@hono/node-server';
import { HttpError, createHonoRouter } from '@typeful-api/hono';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { api, type Order } from './api';

// Callers authenticate with a service token (use a secret manager in a real deployment)
const SERVICE_TOKEN = process.env.SERVICE_TOKEN ?? 'dev-service-token';

// ============================================
// In-Memory Database (for demo purposes)
// ============================================

const orders: Order[] = [
  {
    id: '8f9c2a10-5b7e-4c3d-9a1f-2b6e4d8c1a01',
    customerId: 'customer-42',
    items: [
      { sku: 'PEN-BLUE', quantity: 2, unitPrice: 450 },
      { sku: 'NOTEBOOK-A5', quantity: 1, unitPrice: 1200 },
    ],
    total: 2100,
    status: 'pending',
    createdAt: '2026-11-01T09:30:00.000Z',
  },
  {
    id: '8f9c2a10-5b7e-4c3d-9a1f-2b6e4d8c1a02',
    customerId: 'customer-7',
    items: [{ sku: 'STAPLER', quantity: 1, unitPrice: 1599 }],
    total: 1599,
    status: 'paid',
    createdAt: '2026-11-02T14:05:00.000Z',
  },
];

const findOrder = (id: string): Order => {
  const order = orders.find((candidate) => candidate.id === id);
  if (!order) throw new HttpError(404, `Order ${id} not found`);
  return order;
};

// ============================================
// Router
// ============================================

const router = createHonoRouter(
  api,
  {
    v1: {
      health: () => ({ status: 'ok' as const }),
      orders: {
        list: ({ query }) => {
          const matching = orders.filter((order) => !query.status || order.status === query.status);
          const start = (query.page - 1) * query.limit;
          return {
            items: matching.slice(start, start + query.limit),
            total: matching.length,
            page: query.page,
            limit: query.limit,
            totalPages: Math.ceil(matching.length / query.limit),
          };
        },

        get: ({ params }) => findOrder(params.id),

        markPaid: ({ params }) => {
          const order = findOrder(params.id);
          if (order.status !== 'pending') {
            throw new HttpError(409, {
              code: 'ORDER_NOT_PENDING',
              detail: `Order ${order.id} is already ${order.status}`,
              extensions: { currentStatus: order.status },
            });
          }
          order.status = 'paid';
          return order;
        },
      },
    },
  },
  {
    auth: {
      bearer: ({ token }) => {
        if (token !== SERVICE_TOKEN) throw new Error('Unknown service token');
        return { service: 'trusted-caller' };
      },
    },
    docsConfig: {
      info: { title: 'Orders Service', version: '1.0.0' },
    },
  },
);

const app = new Hono();
app.use('*', logger());
app.route('/api', router);

const port = Number(process.env.PORT) || 3001;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Orders service running at http://localhost:${info.port}`);
  console.log(`API document: http://localhost:${info.port}/api/api-doc`);
});
