import { OpenAPIHono } from '@hono/zod-openapi';
import type { RouteConfig, RouteHandler } from '@hono/zod-openapi';
import type { Env, MiddlewareHandler } from 'hono';
import type {
  ApiContract,
  RouteDefinition,
  RouteGroup,
} from '@typi/core';
import type {
  CreateHonoRouterOptions,
  InferHonoHandlers,
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
  const normalizedPath = route.path.startsWith('/')
    ? route.path
    : `/${route.path}`;

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

  // Query parameters
  if (route.query) {
    config.request = {
      ...config.request,
      query: route.query,
    };
  }

  // Path parameters
  if (route.params) {
    config.request = {
      ...config.request,
      params: route.params,
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
      route.auth === 'bearer'
        ? 'Bearer'
        : route.auth === 'apiKey'
          ? 'ApiKey'
          : 'Basic';
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
 * Recursively apply handlers to a route group
 */
function applyGroupHandlers<E extends Env>(
  group: RouteGroup,
  handlers: unknown,
  target: OpenAPIHono<E>,
  version: string,
  groupPath: string[],
) {
  const h = handlers as {
    middlewares?: MiddlewareHandler[];
  } & Record<string, unknown>;

  // Apply group-level middleware from schema
  if (group.middleware?.length) {
    // Middleware names are just identifiers in the schema
    // Actual middleware must be provided in handlers
  }

  // Apply handler-provided middleware
  if (h.middlewares?.length) {
    target.use(...h.middlewares);
  }

  // Register routes (leaves)
  if (group.routes) {
    for (const [name, route] of Object.entries(group.routes)) {
      const handler = h[name] as RouteHandler<RouteConfig, E> | undefined;
      if (!handler) {
        console.warn(
          `Missing handler for route: ${version}/${groupPath.join('/')}/${name}`,
        );
        continue;
      }

      const routeConfig = toRouteConfig(route, name, version, groupPath);

      // Create a wrapper that extracts typed data and calls the user handler
      const wrappedHandler: RouteHandler<RouteConfig, E> = async (c) => {
        const ctx = {
          c,
          body: route.body ? c.req.valid('json' as never) : undefined,
          query: route.query ? c.req.valid('query' as never) : undefined,
          params: route.params ? c.req.valid('param' as never) : undefined,
        };

        const result = await (
          handler as (ctx: typeof ctx) => Promise<unknown>
        )(ctx);
        return c.json(result as object);
      };

      target.openapi(routeConfig, wrappedHandler);
    }
  }

  // Recurse into children
  if (group.children) {
    for (const [childName, childGroup] of Object.entries(group.children)) {
      const childHandlers = h[childName];
      const childApp = new OpenAPIHono<E>();

      applyGroupHandlers(
        childGroup,
        childHandlers ?? {},
        childApp,
        version,
        [...groupPath, childName],
      );

      target.route(`/${childName}`, childApp);
    }
  }
}

/**
 * Register security schemes based on auth types used in the contract
 */
function registerSecuritySchemes<E extends Env>(
  app: OpenAPIHono<E>,
  contract: ApiContract,
) {
  const authTypes = new Set<string>();

  // Collect all auth types from the contract
  function collectAuthTypes(group: RouteGroup) {
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
  }

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
 * Create a Hono router from an API contract with type-safe handlers
 *
 * @example
 * ```ts
 * import { createHonoRouter } from '@typi/hono';
 * import { api } from './api';
 *
 * const router = createHonoRouter(api, {
 *   v1: {
 *     products: {
 *       list: async ({ c }) => {
 *         const products = await db.products.findMany();
 *         return products;
 *       },
 *       get: async ({ c, params }) => {
 *         const product = await db.products.find(params.id);
 *         return product;
 *       },
 *     },
 *   },
 * });
 *
 * app.route('/api', router);
 * ```
 */
export function createHonoRouter<
  C extends ApiContract,
  M extends VersionEnvMap<C>,
>(
  contract: C,
  handlers: InferHonoHandlers<C, M>,
  options: CreateHonoRouterOptions = {},
): OpenAPIHono<Env> {
  const { basePath = '', middleware = [] } = options;

  const app = basePath ? new OpenAPIHono().basePath(basePath) : new OpenAPIHono();

  // Apply global middleware
  if (middleware.length > 0) {
    app.use(...middleware);
  }

  // Register security schemes
  registerSecuritySchemes(app, contract);

  // Mount each version
  for (const [version, versionGroup] of Object.entries(contract)) {
    const versionHandlers = (handlers as Record<string, unknown>)[version] ?? {};
    const versionApp = new OpenAPIHono();

    // Apply version-level middleware
    const versionH = versionHandlers as { middlewares?: MiddlewareHandler[] };
    if (versionH.middlewares?.length) {
      versionApp.use(...versionH.middlewares);
    }

    // Process children (top-level groups like 'products', 'users')
    if (versionGroup.children) {
      for (const [groupName, groupDef] of Object.entries(versionGroup.children)) {
        const groupHandlers = (versionHandlers as Record<string, unknown>)[groupName];
        const groupApp = new OpenAPIHono();

        applyGroupHandlers(groupDef, groupHandlers ?? {}, groupApp, version, [
          groupName,
        ]);

        versionApp.route(`/${groupName}`, groupApp);
      }
    }

    // Process direct routes on version (if any)
    if (versionGroup.routes) {
      applyGroupHandlers(
        { routes: versionGroup.routes },
        versionHandlers,
        versionApp,
        version,
        [],
      );
    }

    app.route(`/${version}`, versionApp);
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
