/**
 * Checkout Service Contract
 *
 * Checkout's own API. It knows nothing about the orders service's code: orders are reached
 * through ./clients/orders.ts, generated from the orders service's /api-doc.
 */

import { defineApi, problemSchema, route } from '@typeful-api/core';
import { z } from 'zod';

export const ReceiptSchema = z.object({
  orderId: z.uuid(),
  amount: z.number().int().describe('Amount charged in cents'),
  paymentMethod: z.enum(['card', 'invoice']),
  paidAt: z.iso.datetime(),
});

export const OrderNotPayableProblem = problemSchema(409, 'ORDER_NOT_PAYABLE');
export const UpstreamProblem = problemSchema(502, 'UPSTREAM_ERROR');

export const api = defineApi({
  v1: {
    children: {
      checkout: {
        routes: {
          pay: route
            .post('/')
            .body(
              z.object({
                orderId: z.uuid().describe('Order to pay'),
                paymentMethod: z.enum(['card', 'invoice']),
              }),
            )
            .returns(ReceiptSchema)
            .withErrors(404)
            .withResponses({ 409: OrderNotPayableProblem, 502: UpstreamProblem })
            .withSummary('Pay for an order'),
        },
      },
    },
  },
});
