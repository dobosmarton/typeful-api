import type { ApiContract, HttpMethod, RouteDefinition, RouteGroup } from '@typefulapi/core';
import { generateSpec } from '@typefulapi/core';
import type { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { Router as createRouter } from 'express';
import type { ZodError } from 'zod';
import type {
  CreateExpressRouterOptions,
  ExpressHandler,
  InferExpressHandlers,
  ValidationError,
} from './types';

/**
 * Default validation error handler
 */
function defaultValidationErrorHandler(
  error: ValidationError,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  res.status(422).json({
    error: 'Validation Error',
    type: error.type,
    details: error.errors,
  });
}

/**
 * Convert Zod error to ValidationError
 */
function zodToValidationError(
  zodError: ZodError,
  type: 'body' | 'query' | 'params',
): ValidationError {
  return {
    type,
    errors: zodError.issues.map((e) => ({
      path: e.path.map(String),
      message: e.message,
    })),
  };
}

/**
 * Create validation middleware for a route
 */
function createValidationMiddleware(
  route: RouteDefinition,
  options: CreateExpressRouterOptions,
): RequestHandler {
  const { validateBody = true, validateQuery = true, validateParams = true } = options;
  const onError = options.onValidationError ?? defaultValidationErrorHandler;

  return (req, res, next) => {
    try {
      // Validate body
      if (validateBody && route.body && ['post', 'put', 'patch'].includes(route.method)) {
        const result = route.body.safeParse(req.body);
        if (!result.success) {
          return onError(zodToValidationError(result.error, 'body'), req, res, next);
        }
        req.body = result.data;
      }

      // Validate query
      if (validateQuery && route.query) {
        const result = route.query.safeParse(req.query);
        if (!result.success) {
          return onError(zodToValidationError(result.error, 'query'), req, res, next);
        }
        // Assign validated query (cast needed for Express types)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (req as any).query = result.data;
      }

      // Validate params
      if (validateParams && route.params) {
        const result = route.params.safeParse(req.params);
        if (!result.success) {
          return onError(zodToValidationError(result.error, 'params'), req, res, next);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (req as any).params = result.data;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Convert path from :param syntax to Express compatible format
 * (Express already uses :param syntax, so this is mainly for consistency)
 */
function normalizePath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized.replace(/\/$/, '') || '/';
}

/**
 * Map HTTP method to Express router method
 */
function getRouterMethod(router: Router, method: HttpMethod) {
  const methods: Record<HttpMethod, typeof router.get> = {
    get: router.get.bind(router),
    post: router.post.bind(router),
    put: router.put.bind(router),
    patch: router.patch.bind(router),
    delete: router.delete.bind(router),
  };
  return methods[method];
}

/**
 * Recursively apply handlers to a route group for Express
 */
function applyGroupHandlers(
  group: RouteGroup,
  handlers: unknown,
  router: Router,
  options: CreateExpressRouterOptions,
  version: string,
  groupPath: string[],
) {
  const h = handlers as {
    middleware?: RequestHandler[];
  } & Record<string, unknown>;

  // Apply group-level middleware
  if (h.middleware?.length) {
    router.use(...h.middleware);
  }

  // Register routes (leaves)
  if (group.routes) {
    for (const [name, route] of Object.entries(group.routes)) {
      const handler = h[name] as ExpressHandler<RouteDefinition> | undefined;
      if (!handler) {
        console.warn(`Missing handler for route: ${version}/${groupPath.join('/')}/${name}`);
        continue;
      }

      const path = normalizePath(route.path);
      const routerMethod = getRouterMethod(router, route.method);

      // Create validation middleware
      const validationMiddleware = createValidationMiddleware(route, options);

      // Create the actual handler
      const expressHandler: RequestHandler = async (req, res, next) => {
        try {
          const ctx = {
            req,
            res,
            body: req.body,
            query: req.query,
            params: req.params,
          };

          const result = await handler(ctx as never);
          res.json(result);
        } catch (error) {
          next(error);
        }
      };

      // Register route with validation and handler
      routerMethod(path, validationMiddleware, expressHandler);
    }
  }

  // Recurse into children
  if (group.children) {
    for (const [childName, childGroup] of Object.entries(group.children)) {
      const childHandlers = h[childName];
      const childRouter = createRouter();

      applyGroupHandlers(childGroup, childHandlers ?? {}, childRouter, options, version, [
        ...groupPath,
        childName,
      ]);

      router.use(`/${childName}`, childRouter);
    }
  }
}

/**
 * Create an Express router from an API contract with type-safe handlers
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { createExpressRouter } from '@typefulapi/express';
 * import { api } from './api';
 *
 * const router = createExpressRouter(api, {
 *   v1: {
 *     products: {
 *       list: async ({ req, query }) => {
 *         const products = await db.products.findMany({ page: query.page });
 *         return products;
 *       },
 *       get: async ({ params }) => {
 *         const product = await db.products.find(params.id);
 *         return product;
 *       },
 *       create: async ({ body }) => {
 *         const product = await db.products.create(body);
 *         return product;
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
 */
export function createExpressRouter<C extends ApiContract>(
  contract: C,
  handlers: InferExpressHandlers<C>,
  options: CreateExpressRouterOptions = {},
): Router {
  const router = createRouter();
  const { middleware = [], registerDocs = true, docsPath = '/api-doc', docsConfig } = options;

  // Apply global middleware
  if (middleware.length > 0) {
    router.use(...middleware);
  }

  // Mount each version
  for (const [version, versionGroup] of Object.entries(contract)) {
    const versionHandlers = (handlers as Record<string, unknown>)[version] ?? {};
    const versionRouter = createRouter();

    // Apply version-level middleware
    const versionH = versionHandlers as { middleware?: RequestHandler[] };
    if (versionH.middleware?.length) {
      versionRouter.use(...versionH.middleware);
    }

    // Process children (top-level groups like 'products', 'users')
    if (versionGroup.children) {
      for (const [groupName, groupDef] of Object.entries(versionGroup.children)) {
        const groupHandlers = (versionHandlers as Record<string, unknown>)[groupName];
        const groupRouter = createRouter();

        applyGroupHandlers(groupDef, groupHandlers ?? {}, groupRouter, options, version, [
          groupName,
        ]);

        versionRouter.use(`/${groupName}`, groupRouter);
      }
    }

    // Process direct routes on version (if any)
    if (versionGroup.routes) {
      applyGroupHandlers(
        { routes: versionGroup.routes },
        versionHandlers,
        versionRouter,
        options,
        version,
        [],
      );
    }

    router.use(`/${version}`, versionRouter);
  }

  // Register OpenAPI documentation route
  if (registerDocs) {
    const spec = generateSpec(contract, {
      info: docsConfig?.info ?? {
        title: 'API Documentation',
        version: '1.0.0',
      },
      ...(docsConfig?.servers && { servers: docsConfig.servers }),
    });

    router.get(docsPath, (_req: Request, res: Response) => {
      res.json(spec);
    });
  }

  return router;
}
