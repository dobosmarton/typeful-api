import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { WithLocals } from './types';

/**
 * Create typed middleware that adds data to request locals
 *
 * @example
 * ```ts
 * type DbLocals = { db: Database };
 *
 * const dbMiddleware = createTypedMiddleware<DbLocals>(async (req, res, next) => {
 *   req.locals.db = await createDbClient();
 *   next();
 * });
 * ```
 */
export function createTypedMiddleware<TLocals>(
  handler: (req: WithLocals<TLocals>, res: Response, next: NextFunction) => void | Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    // Ensure locals exists on request (custom property for request-scoped data)
    const reqWithLocals = req as WithLocals<TLocals>;
    if (!reqWithLocals.locals) {
      reqWithLocals.locals = {} as TLocals;
    }
    return handler(reqWithLocals, res, next);
  };
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
export function composeMiddleware(middlewares: RequestHandler[]): RequestHandler {
  return (req, res, next) => {
    let index = 0;

    const runMiddleware = (err?: unknown): void => {
      if (err) {
        return next(err);
      }

      if (index >= middlewares.length) {
        return next();
      }

      const currentMiddleware = middlewares[index++];
      try {
        currentMiddleware?.(req, res, runMiddleware);
      } catch (error) {
        next(error);
      }
    };

    runMiddleware();
  };
}

/**
 * Get typed locals from request
 *
 * @example
 * ```ts
 * type MyLocals = { db: Database; user: User };
 *
 * const handler: RequestHandler = (req, res) => {
 *   const { db, user } = getLocals<MyLocals>(req);
 *   // db and user are typed
 * };
 * ```
 */
export function getLocals<T>(req: Request): T {
  return (req as WithLocals<T>).locals;
}

/**
 * Conditional middleware that only runs if a condition is met
 *
 * @example
 * ```ts
 * const conditionalAuth = conditionalMiddleware(
 *   (req) => !req.path.startsWith('/public'),
 *   authMiddleware,
 * );
 * ```
 */
export function conditionalMiddleware(
  condition: (req: Request) => boolean,
  middleware: RequestHandler,
): RequestHandler {
  return (req, res, next) => {
    if (condition(req)) {
      return middleware(req, res, next);
    }
    next();
  };
}

/**
 * Create middleware that sets a local value from an async factory function
 *
 * @example
 * ```ts
 * const dbMiddleware = createLocalsMiddleware('db', async (req) => {
 *   return createDbClient(process.env.DATABASE_URL);
 * });
 * ```
 */
export function createLocalsMiddleware<K extends string, V>(
  key: K,
  factory: (req: Request) => V | Promise<V>,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const value = await factory(req);
      const reqWithLocals = req as WithLocals<Record<K, V>>;
      if (!reqWithLocals.locals) {
        reqWithLocals.locals = {} as Record<K, V>;
      }
      reqWithLocals.locals[key] = value;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Error handling middleware wrapper
 *
 * @example
 * ```ts
 * const errorHandler = createErrorHandler((error, req, res) => {
 *   console.error(error);
 *   res.status(500).json({ error: 'Internal Server Error' });
 * });
 *
 * app.use(errorHandler);
 * ```
 */
export function createErrorHandler(
  handler: (error: Error, req: Request, res: Response) => void,
): (error: Error, req: Request, res: Response, next: NextFunction) => void {
  return (error, req, res, _next) => {
    handler(error, req, res);
  };
}

// Re-export types
export type { WithLocals } from './types';
