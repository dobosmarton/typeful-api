import type {
  FastifyInstance,
  FastifyPluginCallback,
  FastifyRequest,
  FastifyReply,
  RouteShorthandOptions,
  preHandlerAsyncHookHandler,
} from 'fastify';
import type { ZodSchema, ZodError } from 'zod';
import type {
  ApiContract,
  HttpMethod,
  RouteDefinition,
  RouteGroup,
} from '@typi/core';
import type {
  CreateFastifyPluginOptions,
  FastifyHandler,
  InferFastifyHandlers,
} from './types';

/**
 * Convert Zod error to Fastify-compatible error format
 */
function formatZodError(error: ZodError): object {
  return {
    statusCode: 422,
    error: 'Validation Error',
    message: 'Request validation failed',
    details: error.issues.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    })),
  };
}

/**
 * Create a validation preHandler for a route
 */
function createValidationPreHandler(
  route: RouteDefinition,
): preHandlerAsyncHookHandler {
  return async (request, reply) => {
    // Validate body
    if (route.body && ['post', 'put', 'patch'].includes(route.method)) {
      const result = (route.body as ZodSchema).safeParse(request.body);
      if (!result.success) {
        return reply.status(422).send(formatZodError(result.error));
      }
      request.body = result.data;
    }

    // Validate query
    if (route.query) {
      const result = (route.query as ZodSchema).safeParse(request.query);
      if (!result.success) {
        return reply.status(422).send(formatZodError(result.error));
      }
      (request as FastifyRequest).query = result.data;
    }

    // Validate params
    if (route.params) {
      const result = (route.params as ZodSchema).safeParse(request.params);
      if (!result.success) {
        return reply.status(422).send(formatZodError(result.error));
      }
      request.params = result.data;
    }
  };
}

/**
 * Convert path from :param syntax to Fastify compatible format
 * (Fastify already uses :param syntax, so this is mainly for consistency)
 */
function normalizePath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized.replace(/\/$/, '') || '/';
}

/**
 * Recursively register routes from a group
 */
function registerGroupRoutes(
  fastify: FastifyInstance,
  group: RouteGroup,
  handlers: unknown,
  options: CreateFastifyPluginOptions,
  version: string,
  groupPath: string[],
) {
  const h = handlers as {
    preHandler?: preHandlerAsyncHookHandler | preHandlerAsyncHookHandler[];
  } & Record<string, unknown>;

  // Collect preHandlers for this group
  const groupPreHandlers: preHandlerAsyncHookHandler[] = [];
  if (h.preHandler) {
    if (Array.isArray(h.preHandler)) {
      groupPreHandlers.push(...h.preHandler);
    } else {
      groupPreHandlers.push(h.preHandler);
    }
  }

  // Register routes (leaves)
  if (group.routes) {
    for (const [name, route] of Object.entries(group.routes)) {
      const handler = h[name] as FastifyHandler<RouteDefinition> | undefined;
      if (!handler) {
        fastify.log.warn(
          `Missing handler for route: ${version}/${groupPath.join('/')}/${name}`,
        );
        continue;
      }

      const path = normalizePath(route.path);
      const method = route.method.toUpperCase() as Uppercase<HttpMethod>;

      // Build route options
      const routeOptions: RouteShorthandOptions = {
        preHandler: [
          ...groupPreHandlers,
          createValidationPreHandler(route),
        ],
      };

      // Create the actual handler
      const fastifyHandler = async (
        request: FastifyRequest,
        reply: FastifyReply,
      ) => {
        const ctx = {
          request,
          reply,
          body: request.body,
          query: request.query,
          params: request.params,
        };

        const result = await handler(ctx as never);
        return reply.send(result);
      };

      // Register route
      fastify.route({
        method,
        url: path,
        ...routeOptions,
        handler: fastifyHandler,
      });
    }
  }

  // Recurse into children as sub-plugins with prefix
  if (group.children) {
    for (const [childName, childGroup] of Object.entries(group.children)) {
      const childHandlers = h[childName];

      fastify.register(
        async (childFastify) => {
          registerGroupRoutes(
            childFastify,
            childGroup,
            childHandlers ?? {},
            options,
            version,
            [...groupPath, childName],
          );
        },
        { prefix: `/${childName}` },
      );
    }
  }
}

/**
 * Create a Fastify plugin from an API contract with type-safe handlers
 *
 * @example
 * ```ts
 * import Fastify from 'fastify';
 * import { createFastifyPlugin } from '@typi/fastify';
 * import { api } from './api';
 *
 * const fastify = Fastify();
 *
 * fastify.register(
 *   createFastifyPlugin(api, {
 *     v1: {
 *       preHandler: [corsPreHandler],
 *       products: {
 *         preHandler: [dbPreHandler],
 *         list: async ({ request, query }) => {
 *           const db = request.server.db;
 *           return db.products.findMany({ page: query.page });
 *         },
 *         get: async ({ params }) => {
 *           const db = request.server.db;
 *           return db.products.find(params.id);
 *         },
 *         create: async ({ body }) => {
 *           const db = request.server.db;
 *           return db.products.create(body);
 *         },
 *       },
 *     },
 *   }),
 *   { prefix: '/api' }
 * );
 *
 * fastify.listen({ port: 3000 });
 * ```
 */
export function createFastifyPlugin<C extends ApiContract>(
  contract: C,
  handlers: InferFastifyHandlers<C>,
  options: CreateFastifyPluginOptions = {},
): FastifyPluginCallback {
  const plugin: FastifyPluginCallback = async (fastify, _opts) => {
    // Apply global preHandler
    if (options.preHandler) {
      const preHandlers = Array.isArray(options.preHandler)
        ? options.preHandler
        : [options.preHandler];
      fastify.addHook('preHandler', async function (request, reply) {
        for (const handler of preHandlers) {
          await handler.call(this, request, reply);
        }
      });
    }

    // Apply custom error handler
    if (options.errorHandler) {
      fastify.setErrorHandler(options.errorHandler);
    }

    // Mount each version as a sub-plugin with prefix
    for (const [version, versionGroup] of Object.entries(contract)) {
      const versionHandlers = (handlers as Record<string, unknown>)[version] ?? {};

      fastify.register(
        async (versionFastify) => {
          // Apply version-level preHandler
          const versionH = versionHandlers as {
            preHandler?: preHandlerAsyncHookHandler | preHandlerAsyncHookHandler[];
          };
          if (versionH.preHandler) {
            const preHandlers = Array.isArray(versionH.preHandler)
              ? versionH.preHandler
              : [versionH.preHandler];
            versionFastify.addHook('preHandler', async function (request, reply) {
              for (const handler of preHandlers) {
                await handler.call(this, request, reply);
              }
            });
          }

          // Process children (top-level groups like 'products', 'users')
          if (versionGroup.children) {
            for (const [groupName, groupDef] of Object.entries(versionGroup.children)) {
              const groupHandlers = (versionHandlers as Record<string, unknown>)[groupName];

              versionFastify.register(
                async (groupFastify) => {
                  registerGroupRoutes(
                    groupFastify,
                    groupDef,
                    groupHandlers ?? {},
                    options,
                    version,
                    [groupName],
                  );
                },
                { prefix: `/${groupName}` },
              );
            }
          }

          // Process direct routes on version (if any)
          if (versionGroup.routes) {
            registerGroupRoutes(
              versionFastify,
              { routes: versionGroup.routes },
              versionHandlers,
              options,
              version,
              [],
            );
          }
        },
        { prefix: `/${version}` },
      );
    }
  };

  return plugin;
}
