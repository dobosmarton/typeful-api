import type {
  ApiContract,
  AuthConfig,
  AuthType,
  HttpMethod,
  RouteDefinition,
  RouteGroup,
} from '@typeful-api/core';
import {
  generateSpec,
  isWithHeaders,
  extractBearerToken,
  extractApiKey,
  extractBasicCredentials,
} from '@typeful-api/core';
import type { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { Router as createRouter } from 'express';
import type { ZodError } from 'zod';
import type { CreateExpressRouterOptions, InferExpressHandlers, ValidationError } from './types';

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
      // Store validated data on res.locals so the handler can read it.
      // Express 5 makes req.query and req.params read-only getters,
      // so we cannot reassign them.
      const validated: Record<string, unknown> = {};

      // Validate body
      if (validateBody && route.body && ['post', 'put', 'patch'].includes(route.method)) {
        const result = route.body.safeParse(req.body);
        if (!result.success) {
          return onError(zodToValidationError(result.error, 'body'), req, res, next);
        }
        req.body = result.data;
        validated.body = result.data;
      }

      // Validate query
      if (validateQuery && route.query) {
        const result = route.query.safeParse(req.query);
        if (!result.success) {
          return onError(zodToValidationError(result.error, 'query'), req, res, next);
        }
        validated.query = result.data;
      }

      // Validate params
      if (validateParams && route.params) {
        const result = route.params.safeParse(req.params);
        if (!result.success) {
          return onError(zodToValidationError(result.error, 'params'), req, res, next);
        }
        validated.params = result.data;
      }

      res.locals._validated = validated;
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
 * Loose handler function shape used for runtime dispatch.
 * Type safety is enforced at the call site via InferExpressHandlers<C>.
 */
type UserHandler = (ctx: {
  req: Request;
  res: Response;
  body: unknown;
  query: unknown;
  params: unknown;
}) => Promise<unknown> | unknown;

/**
 * Create an Express middleware that enforces auth for a route.
 */
/**
 * Extract credentials from an Express request based on auth type.
 */
function extractCredentials(
  authType: AuthType,
  req: Request,
): Record<string, unknown> | null {
  const authHeader = req.headers.authorization;
  const extractors: Record<string, () => Record<string, unknown> | null> = {
    bearer: () => { const token = extractBearerToken(authHeader); return token ? { token } : null; },
    apiKey: () => { const key = extractApiKey(req.headers['x-api-key'] as string | undefined); return key ? { key } : null; },
    basic: () => extractBasicCredentials(authHeader),
  };
  return extractors[authType]?.() ?? null;
}

function createAuthMiddleware(
  authType: AuthType,
  authConfig: AuthConfig,
): RequestHandler | null {
  if (authType === 'none') return null;
  const verifyFn = authConfig[authType];
  if (!verifyFn) return null;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const credentials = extractCredentials(authType, req);
      if (!credentials) {
        res.status(401).json({ code: 'UNAUTHORIZED', message: 'Missing credentials' });
        return;
      }
      res.locals._authUser = await verifyFn(credentials as never);
      next();
    } catch (error) {
      if (authConfig.onError) {
        await authConfig.onError(error, authType);
      }
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Authentication failed' });
    }
  };
}

/**
 * Constraint type for handler groups passed to the recursive registrar.
 * Generic `H extends ExpressGroupHandlers` allows additional properties
 * beyond the constraint — no index signature needed.
 */
type ExpressGroupHandlers = {
  middleware?: RequestHandler[];
};

/**
 * Recursively apply handlers to a route group for Express
 */
const applyGroupHandlers = <H extends ExpressGroupHandlers>(
  group: RouteGroup,
  handlers: H,
  router: Router,
  options: CreateExpressRouterOptions,
  version: string,
  groupPath: string[],
): void => {
  // Apply group-level middleware — direct access via typed constraint
  if (handlers.middleware?.length) {
    router.use(...handlers.middleware);
  }

  // Typed Record view for dynamic route/child lookups
  const entries = handlers as Record<string, UserHandler | ExpressGroupHandlers | undefined>;

  // Register routes (leaves)
  if (group.routes) {
    for (const [name, route] of Object.entries(group.routes)) {
      const handler = entries[name] as UserHandler | undefined;
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
          // Use validated data from res.locals when available (set by validation middleware).
          // Falls back to raw req properties when validation is disabled.
          const validated = (res.locals._validated ?? {}) as Record<string, unknown>;
          const ctx = {
            req,
            res,
            body: validated.body ?? req.body,
            query: validated.query ?? req.query,
            params: validated.params ?? req.params,
          };

          const result = await handler(ctx);
          if (isWithHeaders(result)) {
            res.set(result.headers);
            res.json(result.body);
          } else {
            res.json(result);
          }
        } catch (error) {
          next(error);
        }
      };

      // Build middleware stack: [auth] → validation → handler
      const middlewareStack: RequestHandler[] = [];
      if (route.auth && route.auth !== 'none' && options.auth) {
        const authMw = createAuthMiddleware(route.auth, options.auth);
        if (authMw) middlewareStack.push(authMw);
      }
      middlewareStack.push(validationMiddleware, expressHandler);
      routerMethod(path, ...middlewareStack);
    }
  }

  // Recurse into children
  if (group.children) {
    for (const [childName, childGroup] of Object.entries(group.children)) {
      const childHandlers = (entries[childName] ?? {}) as ExpressGroupHandlers;
      const childRouter = createRouter();

      applyGroupHandlers(childGroup, childHandlers, childRouter, options, version, [
        ...groupPath,
        childName,
      ]);

      router.use(`/${childName}`, childRouter);
    }
  }
};

/**
 * Create an Express router from an API contract with type-safe handlers
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { createExpressRouter } from '@typeful-api/express';
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
  // Single boundary cast: bridges InferExpressHandlers<C> mapped type to runtime record
  const typedHandlers = handlers as Record<string, ExpressGroupHandlers>;

  for (const [version, versionGroup] of Object.entries(contract)) {
    const versionHandlers: ExpressGroupHandlers = typedHandlers[version] ?? {};
    const versionRouter = createRouter();

    // Apply version-level middleware — direct access via typed constraint
    if (versionHandlers.middleware?.length) {
      versionRouter.use(...versionHandlers.middleware);
    }

    // Typed Record view for dynamic child group lookups
    const versionEntries = versionHandlers as Record<
      string,
      UserHandler | ExpressGroupHandlers | undefined
    >;

    // Process children (top-level groups like 'products', 'users')
    if (versionGroup.children) {
      for (const [groupName, groupDef] of Object.entries(versionGroup.children)) {
        const groupHandlers = (versionEntries[groupName] ?? {}) as ExpressGroupHandlers;
        const groupRouter = createRouter();

        applyGroupHandlers(groupDef, groupHandlers, groupRouter, options, version, [groupName]);

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
      ...(docsConfig?.openapiVersion && { openapiVersion: docsConfig.openapiVersion }),
    });

    router.get(docsPath, (_req: Request, res: Response) => {
      res.json(spec);
    });
  }

  return router;
}
