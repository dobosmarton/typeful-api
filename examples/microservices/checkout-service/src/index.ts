/**
 * Checkout Service
 *
 * An Express service that takes payments for orders. It calls the orders service through a
 * client generated from that service's /api-doc (./clients/orders.ts), with typed requests and
 * a response union it narrows on the status.
 *
 * Run with: pnpm dev (port 3002), with the orders service running on port 3001
 */

import { HttpError, createExpressRouter, problemErrorHandler } from '@typeful-api/express';
import express from 'express';
import { api } from './api';
import { createApiClient } from './clients/orders';

const orders = createApiClient({
  baseUrl: process.env.ORDERS_URL ?? 'http://localhost:3001/api',
  headers: { Authorization: `Bearer ${process.env.SERVICE_TOKEN ?? 'dev-service-token'}` },
});

const upstreamError = (detail: string) =>
  new HttpError(502, { code: 'UPSTREAM_ERROR', detail: `Orders service: ${detail}` });

const router = createExpressRouter(
  api,
  {
    v1: {
      checkout: {
        pay: async ({ body }) => {
          // Each status is typed: 200 → Order, 404 → NOT_FOUND problem, 401/422 → problems
          const order = await orders.v1.orders.get({ params: { id: body.orderId } });
          if (order.status === 404) throw new HttpError(404, `Order ${body.orderId} not found`);
          if (order.status !== 200) throw upstreamError(`unexpected ${order.status} response`);

          if (order.body.status !== 'pending') {
            throw new HttpError(409, {
              code: 'ORDER_NOT_PAYABLE',
              detail: `Order is ${order.body.status}`,
            });
          }

          // A real service would charge the payment provider here

          const paid = await orders.v1.orders.markPaid({ params: { id: order.body.id } });
          if (paid.status === 409) {
            // The orders service's custom problem: code and currentStatus are typed
            throw new HttpError(409, {
              code: 'ORDER_NOT_PAYABLE',
              detail: `Order became ${paid.body.currentStatus} during checkout`,
            });
          }
          if (paid.status !== 200) throw upstreamError(`unexpected ${paid.status} response`);

          return {
            orderId: paid.body.id,
            amount: paid.body.total,
            paymentMethod: body.paymentMethod,
            paidAt: new Date().toISOString(),
          };
        },
      },
    },
  },
  {
    docsConfig: { info: { title: 'Checkout Service', version: '1.0.0' } },
  },
);

const app = express();
app.use(express.json());
app.use('/api', router);
app.use(problemErrorHandler());

const port = Number(process.env.PORT) || 3002;

app.listen(port, () => {
  console.log(`Checkout service running at http://localhost:${port}`);
  console.log(`Pay for an order: POST http://localhost:${port}/api/v1/checkout`);
});
