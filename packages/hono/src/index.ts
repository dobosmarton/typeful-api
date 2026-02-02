/**
 * @typi/hono
 *
 * Hono adapter for typi. Creates fully typed Hono routers
 * from API contracts with automatic OpenAPI integration.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono';
 * import { createHonoRouter } from '@typi/hono';
 * import { api } from './api';
 *
 * // Define environment types per group
 * type Envs = {
 *   v1: {
 *     products: { Bindings: Env; Variables: { db: Database } };
 *     users: { Bindings: Env; Variables: { db: Database; user: User } };
 *   };
 * };
 *
 * // Create router with fully typed handlers
 * const router = createHonoRouter<typeof api, Envs>(api, {
 *   v1: {
 *     middlewares: [corsMiddleware],
 *     products: {
 *       middlewares: [dbMiddleware],
 *       list: async ({ c, query }) => {
 *         const db = c.get('db');
 *         return db.products.findMany({ page: query.page });
 *       },
 *       get: async ({ c, params }) => {
 *         const db = c.get('db');
 *         return db.products.find(params.id);
 *       },
 *       create: async ({ c, body }) => {
 *         const db = c.get('db');
 *         return db.products.create(body);
 *       },
 *     },
 *     users: {
 *       middlewares: [dbMiddleware, authMiddleware],
 *       me: async ({ c }) => {
 *         return c.get('user');
 *       },
 *     },
 *   },
 * });
 *
 * const app = new Hono();
 * app.route('/api', router);
 *
 * export default app;
 * ```
 *
 * @packageDocumentation
 */

// Adapter
export { createHonoRegistry, createHonoRouter } from './adapter';

// Middleware helpers
export {
  composeMiddleware,
  conditionalMiddleware,
  createTypedMiddleware,
  createVariableMiddleware,
  getVariables,
} from './middleware';

// Types
export type {
  CreateHonoRouterOptions,
  HonoHandler,
  HonoRouteContext,
  InferHonoGroupHandlers,
  InferHonoHandlers,
  VersionEnvMap,
  WithVariables,
} from './types';

// Re-export core types for convenience
export type {
  ApiContract,
  RouteDefinition,
  RouteGroup,
} from '@typi/core';
