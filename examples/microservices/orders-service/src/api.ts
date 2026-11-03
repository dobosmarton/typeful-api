/**
 * Orders Service Contract
 *
 * The orders service owns this contract. Other services never import it: they generate a client
 * from the OpenAPI document the service serves at /api/api-doc.
 */

import { defineApi, paginated, paginationQuery, problemSchema, route } from '@typeful-api/core';
import { z } from 'zod';

// ============================================
// Schemas
// ============================================

export const OrderStatusSchema = z.enum(['pending', 'paid', 'cancelled']);

export const OrderSchema = z.object({
  id: z.uuid().describe('Order identifier'),
  customerId: z.string().describe('Customer who placed the order'),
  items: z
    .array(
      z.object({
        sku: z.string().describe('Product SKU'),
        quantity: z.number().int().positive().describe('Number of units'),
        unitPrice: z.number().int().nonnegative().describe('Price per unit in cents'),
      }),
    )
    .min(1),
  total: z.number().int().nonnegative().describe('Order total in cents'),
  status: OrderStatusSchema.describe('Payment status'),
  createdAt: z.iso.datetime().describe('When the order was placed'),
});

export type Order = z.infer<typeof OrderSchema>;

const OrderIdParams = z.object({ id: z.uuid().describe('Order identifier') });

/**
 * A custom problem type: callers can branch on `code` and read `currentStatus`
 */
export const OrderNotPendingProblem = problemSchema(409, 'ORDER_NOT_PENDING', {
  currentStatus: OrderStatusSchema.describe('The status that prevents the change'),
});

// ============================================
// API Contract
// ============================================

export const api = defineApi({
  v1: {
    routes: {
      health: route
        .get('/health')
        .returns(z.object({ status: z.literal('ok') }))
        .withSummary('Health check'),
    },
    children: {
      orders: {
        routes: {
          list: route
            .get('/')
            .query(paginationQuery().extend({ status: OrderStatusSchema.optional() }))
            .returns(paginated(OrderSchema))
            .withAuth('bearer')
            .withSummary('List orders'),

          get: route
            .get('/:id')
            .params(OrderIdParams)
            .returns(OrderSchema)
            .withAuth('bearer')
            .withErrors(404)
            .withSummary('Get an order'),

          markPaid: route
            .post('/:id/pay')
            .params(OrderIdParams)
            .returns(OrderSchema)
            .withAuth('bearer')
            .withErrors(404)
            .withResponses({ 409: OrderNotPendingProblem })
            .withSummary('Mark a pending order as paid'),
        },
      },
    },
  },
});
