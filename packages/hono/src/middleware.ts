import type { Context, Env, MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { WithVariables } from './types';

/**
 * Create a typed middleware that adds variables to the context
 *
 * @example
 * ```ts
 * type DbEnv = WithVariables<BaseEnv, { db: Database }>;
 *
 * const dbMiddleware = createTypedMiddleware<DbEnv>(async (c, next) => {
 *   c.set('db', createDbClient(c.env.DATABASE_URL));
 *   await next();
 * });
 * ```
 */
export function createTypedMiddleware<E extends Env>(
  handler: (c: Context<E>, next: () => Promise<void>) => Promise<void | Response>,
): MiddlewareHandler<E> {
  return createMiddleware<E>(handler);
}

/**
 * Compose multiple middleware into a single middleware
 *
 * @example
 * ```ts
 * const middleware = composeMiddleware([
 *   corsMiddleware,
 *   authMiddleware,
 *   dbMiddleware,
 * ]);
 *
 * app.use(middleware);
 * ```
 */
export function composeMiddleware<E extends Env>(
  middlewares: MiddlewareHandler<E>[],
): MiddlewareHandler<E> {
  return async (c, next) => {
    let index = 0;

    const runMiddleware = async (): Promise<void> => {
      if (index >= middlewares.length) {
        await next();
        return;
      }

      const currentMiddleware = middlewares[index++];
      await currentMiddleware?.(c, runMiddleware);
    };

    await runMiddleware();
  };
}

/**
 * Helper to extract typed variables from context
 *
 * @example
 * ```ts
 * type MyEnv = WithVariables<BaseEnv, { db: Database; user: User }>;
 *
 * const handler = async (c: Context<MyEnv>) => {
 *   const { db, user } = getVariables(c);
 *   // db and user are typed
 * };
 * ```
 */
export function getVariables<E extends Env>(
  c: Context<E>,
): E extends { Variables: infer V } ? V : never {
  // In Hono, c.var gives access to all variables
  return c.var as E extends { Variables: infer V } ? V : never;
}

/**
 * Conditional middleware that only runs if a condition is met
 *
 * @example
 * ```ts
 * const conditionalAuth = conditionalMiddleware(
 *   (c) => !c.req.path.startsWith('/public'),
 *   authMiddleware,
 * );
 * ```
 */
export function conditionalMiddleware<E extends Env>(
  condition: (c: Context<E>) => boolean,
  middleware: MiddlewareHandler<E>,
): MiddlewareHandler<E> {
  return async (c, next) => {
    if (condition(c)) {
      return middleware(c, next);
    }
    await next();
  };
}

/**
 * Create a middleware that sets a variable from an async factory function
 *
 * @example
 * ```ts
 * const dbMiddleware = createVariableMiddleware('db', async (c) => {
 *   return createDbClient(c.env.DATABASE_URL);
 * });
 * ```
 */
export function createVariableMiddleware<E extends Env, K extends string, V>(
  key: K,
  factory: (c: Context<E>) => V | Promise<V>,
): MiddlewareHandler<WithVariables<E, Record<K, V>>> {
  return createMiddleware<WithVariables<E, Record<K, V>>>(async (c, next) => {
    // Type assertion required: Context<WithVariables<E, ...>> is compatible with Context<E>
    // but TypeScript cannot infer this due to the variance of nested generic types
    type BaseContext = Context<E>;
    const baseContext = c as unknown as BaseContext;
    const value = await factory(baseContext);

    // Type assertion required: Hono's c.set expects specific key/value types
    // but we're working with generic K extends string
    (c.set as (k: string, v: V) => void)(key, value);
    await next();
  });
}

// Re-export WithVariables for convenience
export type { WithVariables };
