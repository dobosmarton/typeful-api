/**
 * @typeful-api/express
 *
 * Express adapter for typi. Creates fully typed Express routers
 * from API contracts with automatic request validation.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { createExpressRouter } from '@typeful-api/express';
 * import { api } from './api';
 *
 * // Create router with fully typed handlers
 * const router = createExpressRouter(api, {
 *   v1: {
 *     middleware: [corsMiddleware],
 *     products: {
 *       middleware: [dbMiddleware],
 *       list: async ({ req, query }) => {
 *         const { db } = getLocals<{ db: Database }>(req);
 *         return db.products.findMany({ page: query.page });
 *       },
 *       get: async ({ req, params }) => {
 *         const { db } = getLocals<{ db: Database }>(req);
 *         return db.products.find(params.id);
 *       },
 *       create: async ({ req, body }) => {
 *         const { db } = getLocals<{ db: Database }>(req);
 *         return db.products.create(body);
 *       },
 *     },
 *     users: {
 *       middleware: [dbMiddleware, authMiddleware],
 *       me: async ({ req }) => {
 *         const { user } = getLocals<{ user: User }>(req);
 *         return user;
 *       },
 *     },
 *   },
 * });
 *
 * const app = express();
 * app.use(express.json());
 * app.use('/api', router);
 *
 * app.listen(3000);
 * ```
 *
 * @packageDocumentation
 */

// Adapter
export { createExpressRouter } from './adapter';

// Middleware helpers
export {
  composeMiddleware,
  conditionalMiddleware,
  createErrorHandler,
  createLocalsMiddleware,
  createTypedMiddleware,
  getLocals,
} from './middleware';

// Types
export type {
  CreateExpressRouterOptions,
  ExpressHandler,
  ExpressRouteContext,
  InferExpressGroupHandlers,
  InferExpressHandlers,
  TypedRequest,
  TypedResponse,
  ValidationError,
  WithLocals,
} from './types';

// Re-export core types for convenience
export type { ApiContract, RouteDefinition, RouteGroup } from '@typeful-api/core';
