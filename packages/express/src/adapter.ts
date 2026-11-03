import type {
  ApiContract,
  AuthConfig,
  AuthType,
  HttpMethod,
  ProblemDetails,
  RequestLocation,
  RouteDefinition,
  RouteGroup,
  ValidationError,
} from '@typeful-api/core';
import {
  PROBLEM_CONTENT_TYPE,
  createAuthenticator,
  createProblem,
  generateSpec,
  isHttpError,
  isWithHeaders,
  toValidationError,
} from '@typeful-api/core';
import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  RequestHandler,
  Response,
  Router,
} from 'express';
import { Router as createRouter } from 'express';
import type { ZodType } from 'zod';
import type { CreateExpressRouterOptions, InferExpressHandlers } from './types';

/**
 * Send an RFC 9457 Problem Details response
 */
function sendProblem(
  res: Response,
  problem: ProblemDetails,
  headers: Readonly<Record<string, string>> = {},
): void {
  res.status(problem.status).set(headers).type(PROBLEM_CONTENT_TYPE).json(problem);
}

/**
 * Default validation error handler: 422 Problem Details
 */
function defaultValidationErrorHandler(error: ValidationError, _req: Request, res: Response) {
  sendProblem(res, error.problem);
}

/**
 * Create validation middleware for a route. Checks query, then params, then body.
 */
function createValidationMiddleware(
  route: RouteDefinition,
  options: CreateExpressRouterOptions,
): RequestHandler {
  const { validateBody = true, validateQuery = true, validateParams = true } = options;
  const onError = options.onValidationError ?? defaultValidationErrorHandler;

  const checks: Array<[RequestLocation, ZodType | undefined, (req: Request) => unknown]> = [
    ['query', validateQuery ? route.query : undefined, (req) => req.query],
    ['params', validateParams ? route.params : undefined, (req) => req.params],
    [
      'body',
      validateBody && ['post', 'put', 'patch'].includes(route.method) ? route.body : undefined,
      (req) => req.body,
    ],
  ];

  return async (req, res, next) => {
    try {
      // Store validated data on res.locals so the handler can read it.
      // Express 5 makes req.query and req.params read-only getters,
      // so we cannot reassign them.
      const validated: Record<string, unknown> = {};

      for (const [location, schema, read] of checks) {
        if (!schema) continue;
        const result = await schema.safeParseAsync(read(req));
        if (!result.success) {
          return onError(toValidationError(location, result.error), req, res, next);
        }
        validated[location] = result.data;
      }

      if ('body' in validated) req.body = validated.body;
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
function createAuthMiddleware(authType: AuthType, authConfig: AuthConfig): RequestHandler | null {
  const authenticate = createAuthenticator(authType, authConfig);
  if (!authenticate) return null;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authenticate((name) => req.get(name));
      if (!result.ok) {
        sendProblem(res, result.error.problem, result.error.headers);
        return;
      }
      res.locals._authUser = result.user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

const clientErrorDetails: Record<string, string> = {
  'entity.parse.failed': 'Malformed JSON in request body',
  'entity.too.large': 'Request body is too large',
};

/**
 * A 4xx error whose message is safe to show (e.g. from express.json()/body-parser)
 */
function asExposedClientError(
  error: unknown,
): { status: number; message: string; type?: string } | null {
  if (typeof error !== 'object' || error === null) return null;
  const { expose, status, message, type } = error as Record<string, unknown>;
  if (expose !== true || typeof status !== 'number' || status < 400 || status > 499) return null;
  return {
    status,
    message: typeof message === 'string' ? message : '',
    type: typeof type === 'string' ? type : undefined,
  };
}

/**
 * Express error middleware that sends RFC 9457 Problem Details for `HttpError`s and for
 * client errors raised by body parsers (malformed JSON → 400, body too large → 413).
 * Other errors are passed on with `next(error)`.
 *
 * The router already handles `HttpError`s thrown by your handlers. Add this to your app,
 * after the routes, so errors from app-level middleware such as `express.json()` become
 * problems too.
 *
 * @example
 * ```ts
 * app.use(express.json());
 * app.use('/api', createExpressRouter(api, handlers));
 * app.use(problemErrorHandler());
 * ```
 */
export function problemErrorHandler(): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (isHttpError(error)) return sendProblem(res, error.problem, error.headers);

    const clientError = asExposedClientError(error);
    if (clientError) {
      const detail =
        (clientError.type && clientErrorDetails[clientError.type]) ?? clientError.message;
      return sendProblem(res, createProblem(clientError.status, { detail: detail || undefined }));
    }

    next(error);
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

  // Turn HttpErrors thrown by handlers or middleware into Problem Details responses
  router.use(problemErrorHandler());

  return router;
}
