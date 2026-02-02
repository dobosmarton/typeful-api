/**
 * @typi/hono
 *
 * Hono adapter for typi. Creates fully typed Hono routers
 * from API contracts with automatic OpenAPI integration.
 *
 * Works on multiple runtimes: Node.js, Cloudflare Workers, Deno, Bun, and more.
 *
 * @example Simple mode (Node.js, Bun, Deno)
 * ```ts
 * import { serve } from '@hono/node-server';
 * import { createHonoRouter } from '@typi/hono';
 * import { api } from './api';
 *
 * const router = createHonoRouter(api, {
 *   v1: {
 *     products: {
 *       list: async ({ query }) => {
 *         return { products: [], total: 0, page: query.page };
 *       },
 *     },
 *   },
 * });
 *
 * serve({ fetch: router.fetch, port: 3000 });
 * ```
 *
 * @example Shared variables mode
 * ```ts
 * type Vars = { db: Database; logger: Logger };
 *
 * const router = createHonoRouter<typeof api, Vars>(api, {
 *   v1: {
 *     products: {
 *       list: async ({ c, query }) => {
 *         const db = c.get('db');
 *         return db.products.findMany({ page: query.page });
 *       },
 *     },
 *   },
 * });
 * ```
 *
 * @example Full mode (Cloudflare Workers with Bindings)
 * ```ts
 * type Envs = {
 *   v1: {
 *     products: { Bindings: Env; Variables: { db: Database } };
 *   };
 * };
 *
 * const router = createHonoRouter<typeof api, Envs>(api, {
 *   v1: {
 *     products: {
 *       middlewares: [dbMiddleware],
 *       list: async ({ c, query }) => {
 *         const db = c.get('db');
 *         return db.products.findMany({ page: query.page });
 *       },
 *     },
 *   },
 * });
 *
 * export default router;
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
  // Simplified types for non-Cloudflare platforms
  DefaultEnv,
  InferHonoHandlersWithVars,
  InferSimpleHonoHandlers,
  SimpleEnv,
} from './types';

// Re-export core types for convenience
export type {
  ApiContract,
  RouteDefinition,
  RouteGroup,
} from '@typi/core';
