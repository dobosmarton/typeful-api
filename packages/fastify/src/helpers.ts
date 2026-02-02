import type {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
  preHandlerHookHandler,
} from 'fastify';
import type { RequestWithLocals } from './types';

/**
 * Create a typed preHandler hook
 *
 * @example
 * ```ts
 * const dbPreHandler = createPreHandler(async (request, reply) => {
 *   request.locals = { db: await createDbClient() };
 * });
 * ```
 */
export function createPreHandler(
  handler: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => void | Promise<void>,
): preHandlerHookHandler {
  return handler;
}

/**
 * Get typed locals from request
 *
 * @example
 * ```ts
 * type MyLocals = { db: Database; user: User };
 *
 * const handler = async (request: FastifyRequest, reply: FastifyReply) => {
 *   const { db, user } = getLocals<MyLocals>(request);
 *   // db and user are typed
 * };
 * ```
 */
export function getLocals<T>(request: FastifyRequest): T {
  return (request as RequestWithLocals<T>).locals;
}

/**
 * Set locals on request
 *
 * @example
 * ```ts
 * const dbPreHandler = createPreHandler(async (request) => {
 *   setLocals(request, { db: await createDbClient() });
 * });
 * ```
 */
export function setLocals<T>(request: FastifyRequest, locals: T): void {
  (request as RequestWithLocals<T>).locals = locals;
}

/**
 * Merge locals on request
 *
 * @example
 * ```ts
 * const authPreHandler = createPreHandler(async (request) => {
 *   const user = await authenticateUser(request);
 *   mergeLocals(request, { user });
 * });
 * ```
 */
export function mergeLocals<T extends object>(
  request: FastifyRequest,
  locals: T,
): void {
  const existing = (request as RequestWithLocals<object>).locals ?? {};
  (request as RequestWithLocals<object>).locals = { ...existing, ...locals };
}

/**
 * Create a preHandler that sets a local value from a factory function
 *
 * @example
 * ```ts
 * const dbPreHandler = createLocalsPreHandler('db', async (request) => {
 *   return createDbClient(process.env.DATABASE_URL);
 * });
 * ```
 */
export function createLocalsPreHandler<K extends string, V>(
  key: K,
  factory: (request: FastifyRequest) => V | Promise<V>,
): preHandlerHookHandler {
  return async (request, _reply) => {
    const value = await factory(request);
    mergeLocals(request, { [key]: value } as Record<K, V>);
  };
}

/**
 * Conditional preHandler that only runs if a condition is met
 *
 * @example
 * ```ts
 * const conditionalAuth = conditionalPreHandler(
 *   (request) => !request.url.startsWith('/public'),
 *   authPreHandler,
 * );
 * ```
 */
export function conditionalPreHandler(
  condition: (request: FastifyRequest) => boolean,
  preHandler: preHandlerHookHandler,
): preHandlerHookHandler {
  return async (request, reply) => {
    if (condition(request)) {
      return preHandler(request, reply);
    }
  };
}

/**
 * Compose multiple preHandlers into a single preHandler
 *
 * @example
 * ```ts
 * const combinedPreHandler = composePreHandlers([
 *   corsPreHandler,
 *   authPreHandler,
 *   dbPreHandler,
 * ]);
 * ```
 */
export function composePreHandlers(
  preHandlers: preHandlerHookHandler[],
): preHandlerHookHandler {
  return async (request, reply) => {
    for (const handler of preHandlers) {
      await handler(request, reply);
      // If reply was sent, stop processing
      if (reply.sent) {
        return;
      }
    }
  };
}

/**
 * Decorate Fastify instance with typed properties
 *
 * @example
 * ```ts
 * const fastify = Fastify();
 *
 * decorateInstance(fastify, {
 *   db: await createDbClient(),
 *   config: loadConfig(),
 * });
 *
 * // Now fastify.db and fastify.config are available
 * ```
 */
export function decorateInstance<T extends object>(
  fastify: FastifyInstance,
  decorations: T,
): void {
  for (const [key, value] of Object.entries(decorations)) {
    fastify.decorate(key, value);
  }
}

// Re-export types
export type { RequestWithLocals } from './types';
