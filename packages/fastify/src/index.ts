/**
 * @typeful-api/fastify
 *
 * Fastify adapter for typi. Creates fully typed Fastify plugins
 * from API contracts with automatic request validation via preHandlers.
 *
 * @example
 * ```ts
 * import Fastify from 'fastify';
 * import { createFastifyPlugin, getLocals, mergeLocals } from '@typeful-api/fastify';
 * import { api } from './api';
 *
 * const fastify = Fastify({ logger: true });
 *
 * // Add db preHandler
 * const dbPreHandler = async (request) => {
 *   mergeLocals(request, { db: await createDbClient() });
 * };
 *
 * // Create and register plugin with typed handlers
 * fastify.register(
 *   createFastifyPlugin(api, {
 *     v1: {
 *       preHandler: [corsPreHandler],
 *       products: {
 *         preHandler: [dbPreHandler],
 *         list: async ({ request, query }) => {
 *           const { db } = getLocals<{ db: Database }>(request);
 *           return db.products.findMany({ page: query.page });
 *         },
 *         get: async ({ request, params }) => {
 *           const { db } = getLocals<{ db: Database }>(request);
 *           return db.products.find(params.id);
 *         },
 *         create: async ({ request, body }) => {
 *           const { db } = getLocals<{ db: Database }>(request);
 *           return db.products.create(body);
 *         },
 *       },
 *       users: {
 *         preHandler: [dbPreHandler, authPreHandler],
 *         me: async ({ request }) => {
 *           const { user } = getLocals<{ user: User }>(request);
 *           return user;
 *         },
 *       },
 *     },
 *   }),
 *   { prefix: '/api' }
 * );
 *
 * fastify.listen({ port: 3000 });
 * ```
 *
 * @packageDocumentation
 */

// Adapter
export { createFastifyPlugin } from './adapter';

// Helpers
export {
  composePreHandlers,
  conditionalPreHandler,
  createLocalsPreHandler,
  createPreHandler,
  decorateInstance,
  getLocals,
  mergeLocals,
  setLocals,
} from './helpers';

// Types
export type {
  CreateFastifyPluginOptions,
  FastifyHandler,
  FastifyLocals,
  FastifyRouteContext,
  InferFastifyGroupHandlers,
  InferFastifyHandlers,
  RequestWithLocals,
  TypedFastifyPlugin,
  TypedFastifyRequest,
} from './types';

// Re-export core types for convenience
export type { ApiContract, RouteDefinition, RouteGroup } from '@typeful-api/core';
