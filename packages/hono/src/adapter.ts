import type { RouteConfig, RouteHandler } from '@hono/zod-openapi';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { ApiContract, RouteDefinition, RouteGroup } from '@typeful-api/core';
import type { Context, Env, MiddlewareHandler } from 'hono';
import type { ZodObject } from 'zod';
import type {
  CreateHonoRouterOptions,
  DefaultEnv,
  InferHonoHandlers,
  InferHonoHandlersWithVars,
  InferSimpleHonoHandlers,
  SimpleEnv,
  VersionEnvMap,
} from './types';

/**
 * Convert a RouteDefinition to @hono/zod-openapi RouteConfig format
 */
function toRouteConfig(
  route: RouteDefinition,
  name: string,
  version: string,
  groupPath: string[],
): RouteConfig {
  const normalizedPath = route.path.startsWith('/') ? route.path : `/${route.path}`;

  const config: RouteConfig = {
    method: route.method,
    path: normalizedPath.replace(/\/$/, '') || '/',
    responses: {
      200: {
        description: 'Successful response',
        content: {
          'application/json': {
            schema: route.response,
          },
        },
      },
    },
  };

  // Request body
  if (route.body && ['post', 'put', 'patch'].includes(route.method)) {
    config.request = {
      ...config.request,
      body: {
        content: {
          'application/json': {
            schema: route.body,
          },
        },
        required: true,
      },
    };
  }

  // Query parameters (cast to AnyZodObject as RouteConfig expects ZodObject)
  if (route.query) {
    config.request = {
      ...config.request,
      query: route.query as ZodObject,
    };
  }

  // Path parameters (cast to AnyZodObject as RouteConfig expects ZodObject)
  if (route.params) {
    config.request = {
      ...config.request,
      params: route.params as ZodObject,
    };
  }

  // Metadata
  if (route.summary) {
    config.summary = route.summary;
  }

  if (route.description) {
    config.description = route.description;
  }

  if (route.tags?.length) {
    config.tags = [...route.tags];
  } else if (groupPath.length > 0) {
    config.tags = [groupPath[0] as string];
  }

  if (route.deprecated) {
    config.deprecated = true;
  }

  if (route.operationId) {
    config.operationId = route.operationId;
  } else {
    config.operationId = `${version}_${groupPath.join('_')}_${name}`;
  }

  // Security
  if (route.auth && route.auth !== 'none') {
    const schemeName =
      route.auth === 'bearer' ? 'Bearer' : route.auth === 'apiKey' ? 'ApiKey' : 'Basic';
    config.security = [{ [schemeName]: [] }];
  }

  // Additional responses
  if (route.responses) {
    for (const [code, schema] of Object.entries(route.responses)) {
      config.responses[code] = {
        description: `Response ${code}`,
        content: {
          'application/json': {
            schema,
          },
        },
      };
    }
  }

  return config;
}

/**
 * Constraint type for handler groups passed to the recursive registrar.
 * Generic `H extends HonoGroupHandlers` allows additional properties
 * beyond the constraint — no index signature needed.
 */
type HonoGroupHandlers = {
  middlewares?: MiddlewareHandler[];
};

/**
 * Recursively apply handlers to a route group.
 *
 * Note: Type assertion is required because the generic handlers object
 * comes from the implementation signature which uses a wider type to
 * accommodate all overload signatures.
 */
const applyGroupHandlers = <E extends Env, H extends HonoGroupHandlers>(
  group: RouteGroup,
  handlers: H,
  target: OpenAPIHono<E>,
  version: string,
  groupPath: string[],
): void => {
  // Apply group-level middleware from schema
  if (group.middleware?.length) {
    // Middleware names are just identifiers in the schema
    // Actual middleware must be provided in handlers
  }

  // Apply handler-provided middleware — direct access via typed constraint
  if (handlers.middlewares?.length) {
    target.use(...handlers.middlewares);
  }

  // Register routes (leaves)
  if (group.routes) {
    for (const [name, route] of Object.entries(group.routes)) {
      // User handler is a function that takes {c, body, query, params} and returns the response
      type UserHandler = (ctx: {
        c: Context<E>;
        body: undefined;
        query: undefined;
        params: undefined;
      }) => Promise<object> | object;

      // Typed Record view for dynamic route lookups
      const entries = handlers as Record<string, UserHandler | HonoGroupHandlers | undefined>;
      const handler = entries[name] as UserHandler | undefined;
      if (!handler) {
        console.warn(`Missing handler for route: ${version}/${groupPath.join('/')}/${name}`);
        continue;
      }

      const routeConfig = toRouteConfig(route, name, version, groupPath);

      // Create a wrapper that extracts typed data and calls the user handler
      const wrappedHandler: RouteHandler<RouteConfig, E> = async (c) => {
        const body = route.body ? c.req.valid('json' as never) : undefined;
        const query = route.query ? c.req.valid('query' as never) : undefined;
        const params = route.params ? c.req.valid('param' as never) : undefined;

        const result = await handler({ c, body, query, params });
        return c.json(result as object);
      };

      target.openapi(routeConfig, wrappedHandler);
    }
  }

  // Recurse into children
  if (group.children) {
    const entries = handlers as Record<string, HonoGroupHandlers | undefined>;
    for (const [childName, childGroup] of Object.entries(group.children)) {
      const childHandlers = (entries[childName] ?? {}) as HonoGroupHandlers;
      const childApp = new OpenAPIHono<E>();

      applyGroupHandlers(childGroup, childHandlers, childApp, version, [...groupPath, childName]);

      target.route(`/${childName}`, childApp);
    }
  }
};

/**
 * Register security schemes based on auth types used in the contract
 */
function registerSecuritySchemes<E extends Env>(app: OpenAPIHono<E>, contract: ApiContract): void {
  const authTypes = new Set<string>();

  // Collect all auth types from the contract
  const collectAuthTypes = (group: RouteGroup): void => {
    if (group.routes) {
      for (const route of Object.values(group.routes)) {
        if (route.auth && route.auth !== 'none') {
          authTypes.add(route.auth);
        }
      }
    }
    if (group.children) {
      for (const childGroup of Object.values(group.children)) {
        collectAuthTypes(childGroup);
      }
    }
  };

  for (const versionGroup of Object.values(contract)) {
    collectAuthTypes(versionGroup);
  }

  // Register security schemes
  if (authTypes.has('bearer')) {
    app.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
  }

  if (authTypes.has('apiKey')) {
    app.openAPIRegistry.registerComponent('securitySchemes', 'ApiKey', {
      type: 'apiKey',
      name: 'X-API-Key',
      in: 'header',
    });
  }

  if (authTypes.has('basic')) {
    app.openAPIRegistry.registerComponent('securitySchemes', 'Basic', {
      type: 'http',
      scheme: 'basic',
    });
  }
}

/**
 * Create a Hono router from an API contract with type-safe handlers.
 *
 * Supports three usage modes:
 *
 * **Simple mode** - No type parameters, uses default environment:
 * ```ts
 * const router = createHonoRouter(api, handlers);
 * ```
 *
 * **Shared variables mode** - All handlers share the same variables type:
 * ```ts
 * type Vars = { db: Database; logger: Logger };
 * const router = createHonoRouter<typeof api, Vars>(api, handlers);
 * ```
 *
 * **Full mode** - Per-group environment mapping (Cloudflare Workers):
 * ```ts
 * type EnvMap = {
 *   v1: {
 *     products: { Bindings: Env; Variables: { db: Database } };
 *   };
 * };
 * const router = createHonoRouter<typeof api, EnvMap>(api, handlers);
 * ```
 */

// Overload 1: Simple mode - no type parameters needed
export function createHonoRouter<C extends ApiContract>(
  contract: C,
  handlers: InferSimpleHonoHandlers<C>,
  options?: CreateHonoRouterOptions,
): OpenAPIHono<DefaultEnv>;

// Overload 2: Shared variables mode - single type for all handlers
export function createHonoRouter<C extends ApiContract, V extends Record<string, unknown>>(
  contract: C,
  handlers: InferHonoHandlersWithVars<C, V>,
  options?: CreateHonoRouterOptions,
): OpenAPIHono<SimpleEnv<V>>;

// Overload 3: Full mode - per-group environment mapping (backward compatible)
export function createHonoRouter<C extends ApiContract, M extends VersionEnvMap<C>>(
  contract: C,
  handlers: InferHonoHandlers<C, M>,
  options?: CreateHonoRouterOptions,
): OpenAPIHono<Env>;

// Implementation (signature is not visible to callers - overloads are used)
export function createHonoRouter(
  contract: ApiContract,
  handlers: Record<string, HonoGroupHandlers>,
  options: CreateHonoRouterOptions = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): OpenAPIHono<any> {
  const {
    basePath = '',
    middleware = [],
    registerDocs = true,
    docsPath = '/api-doc',
    docsConfig,
  } = options;

  const app = basePath ? new OpenAPIHono().basePath(basePath) : new OpenAPIHono();

  // Apply global middleware
  if (middleware.length > 0) {
    app.use(...middleware);
  }

  // Register security schemes
  registerSecuritySchemes(app, contract);

  // Mount each version
  for (const [version, versionGroup] of Object.entries(contract)) {
    const versionHandlers: HonoGroupHandlers = handlers[version] ?? {};
    const versionApp = new OpenAPIHono();

    // Apply version-level middleware — direct access via typed constraint
    if (versionHandlers.middlewares?.length) {
      versionApp.use(...versionHandlers.middlewares);
    }

    // Typed Record view for dynamic child group lookups
    const versionEntries = versionHandlers as Record<string, HonoGroupHandlers | undefined>;

    // Process children (top-level groups like 'products', 'users')
    if (versionGroup.children) {
      for (const [groupName, groupDef] of Object.entries(versionGroup.children)) {
        const groupHandlers = (versionEntries[groupName] ?? {}) as HonoGroupHandlers;
        const groupApp = new OpenAPIHono();

        applyGroupHandlers(groupDef, groupHandlers, groupApp, version, [groupName]);

        versionApp.route(`/${groupName}`, groupApp);
      }
    }

    // Process direct routes on version (if any)
    if (versionGroup.routes) {
      applyGroupHandlers({ routes: versionGroup.routes }, versionHandlers, versionApp, version, []);
    }

    app.route(`/${version}`, versionApp);
  }

  // Register OpenAPI documentation route
  if (registerDocs) {
    app.doc(docsPath, {
      openapi: '3.0.0',
      info: docsConfig?.info ?? {
        title: 'API Documentation',
        version: '1.0.0',
      },
      ...(docsConfig?.servers && { servers: docsConfig.servers }),
    });
  }

  return app;
}

/**
 * Create a documentation-only Hono app (no handlers, just OpenAPI schema)
 * Useful for generating specs without implementing handlers
 */
export function createHonoRegistry<C extends ApiContract>(
  contract: C,
  basePath = '',
): OpenAPIHono<Env> {
  const app = basePath ? new OpenAPIHono().basePath(basePath) : new OpenAPIHono();

  registerSecuritySchemes(app, contract);

  // Register routes without handlers (throws if called)
  function registerGroup(
    group: RouteGroup,
    target: OpenAPIHono<Env>,
    version: string,
    groupPath: string[],
  ) {
    if (group.routes) {
      for (const [name, route] of Object.entries(group.routes)) {
        const routeConfig = toRouteConfig(route, name, version, groupPath);
        target.openapi(routeConfig, () => {
          throw new Error(`No handler mounted for ${routeConfig.operationId}`);
        });
      }
    }

    if (group.children) {
      for (const [childName, childGroup] of Object.entries(group.children)) {
        const childApp = new OpenAPIHono();
        registerGroup(childGroup, childApp, version, [...groupPath, childName]);
        target.route(`/${childName}`, childApp);
      }
    }
  }

  for (const [version, versionGroup] of Object.entries(contract)) {
    const versionApp = new OpenAPIHono();

    if (versionGroup.children) {
      for (const [groupName, groupDef] of Object.entries(versionGroup.children)) {
        const groupApp = new OpenAPIHono();
        registerGroup(groupDef, groupApp, version, [groupName]);
        versionApp.route(`/${groupName}`, groupApp);
      }
    }

    if (versionGroup.routes) {
      registerGroup({ routes: versionGroup.routes }, versionApp, version, []);
    }

    app.route(`/${version}`, versionApp);
  }

  return app;
}

/**
 * Internal testing utilities - DO NOT USE IN PRODUCTION
 * Exported for unit testing purposes only
 */
export const __testing = {
  toRouteConfig,
  registerSecuritySchemes,
};
