import type {
  FastifyInstance,
  FastifyPluginCallback,
  FastifyRequest,
  FastifyReply,
  RouteShorthandOptions,
  preHandlerAsyncHookHandler,
} from 'fastify';
import type { ZodType, ZodError } from 'zod';
import type { ApiContract, HttpMethod, RouteDefinition, RouteGroup } from '@typeful-api/core';
import { generateSpec } from '@typeful-api/core';
import type { CreateFastifyPluginOptions, InferFastifyHandlers } from './types';

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
function createValidationPreHandler(route: RouteDefinition): preHandlerAsyncHookHandler {
  return async (request, reply) => {
    // Validate body
    if (route.body && ['post', 'put', 'patch'].includes(route.method)) {
      const result = (route.body as ZodType).safeParse(request.body);
      if (!result.success) {
        return reply.status(422).send(formatZodError(result.error));
      }
      request.body = result.data;
    }

    // Validate query
    if (route.query) {
      const result = (route.query as ZodType).safeParse(request.query);
      if (!result.success) {
        return reply.status(422).send(formatZodError(result.error));
      }
      (request as FastifyRequest).query = result.data;
    }

    // Validate params
    if (route.params) {
      const result = (route.params as ZodType).safeParse(request.params);
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
 * Loose handler function shape used for runtime dispatch.
 * Type safety is enforced at the call site via InferFastifyHandlers<C>.
 */
type UserHandler = (ctx: {
  request: FastifyRequest;
  reply: FastifyReply;
  body: unknown;
  query: unknown;
  params: unknown;
}) => Promise<unknown> | unknown;

/**
 * Constraint type for handler groups passed to the recursive registrar.
 * Generic `H extends FastifyGroupHandlers` allows additional properties
 * beyond the constraint — no index signature needed.
 */
type FastifyGroupHandlers = {
  preHandler?: preHandlerAsyncHookHandler | preHandlerAsyncHookHandler[];
};

/**
 * Recursively register routes from a group
 */
const registerGroupRoutes = <H extends FastifyGroupHandlers>(
  fastify: FastifyInstance,
  group: RouteGroup,
  handlers: H,
  options: CreateFastifyPluginOptions,
  version: string,
  groupPath: string[],
): void => {
  // Collect preHandlers for this group — direct access via typed constraint
  const groupPreHandlers: preHandlerAsyncHookHandler[] = [];
  if (handlers.preHandler) {
    if (Array.isArray(handlers.preHandler)) {
      groupPreHandlers.push(...handlers.preHandler);
    } else {
      groupPreHandlers.push(handlers.preHandler);
    }
  }

  // Typed Record view for dynamic route/child lookups
  const entries = handlers as Record<string, UserHandler | FastifyGroupHandlers | undefined>;

  // Register routes (leaves)
  if (group.routes) {
    for (const [name, route] of Object.entries(group.routes)) {
      const handler = entries[name] as UserHandler | undefined;
      if (!handler) {
        fastify.log.warn(`Missing handler for route: ${version}/${groupPath.join('/')}/${name}`);
        continue;
      }

      const path = normalizePath(route.path);
      const method = route.method.toUpperCase() as Uppercase<HttpMethod>;

      // Build route options
      const routeOptions: RouteShorthandOptions = {
        preHandler: [...groupPreHandlers, createValidationPreHandler(route)],
      };

      // Create the actual handler
      const fastifyHandler = async (request: FastifyRequest, reply: FastifyReply) => {
        const ctx = {
          request,
          reply,
          body: request.body,
          query: request.query,
          params: request.params,
        };

        const result = await handler(ctx);
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
      const childHandlers = (entries[childName] ?? {}) as FastifyGroupHandlers;

      fastify.register(
        async (childFastify) => {
          registerGroupRoutes(childFastify, childGroup, childHandlers, options, version, [
            ...groupPath,
            childName,
          ]);
        },
        { prefix: `/${childName}` },
      );
    }
  }
};

/**
 * Create a Fastify plugin from an API contract with type-safe handlers
 *
 * @example
 * ```ts
 * import Fastify from 'fastify';
 * import { createFastifyPlugin } from '@typeful-api/fastify';
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
  const { registerDocs = true, docsPath = '/api-doc', docsConfig } = options;

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
    // Single boundary cast: bridges InferFastifyHandlers<C> mapped type to runtime record
    const typedHandlers = handlers as Record<string, FastifyGroupHandlers>;

    for (const [version, versionGroup] of Object.entries(contract)) {
      const versionHandlers: FastifyGroupHandlers = typedHandlers[version] ?? {};

      fastify.register(
        async (versionFastify) => {
          // Apply version-level preHandler — direct access via typed constraint
          if (versionHandlers.preHandler) {
            const preHandlers = Array.isArray(versionHandlers.preHandler)
              ? versionHandlers.preHandler
              : [versionHandlers.preHandler];
            versionFastify.addHook('preHandler', async function (request, reply) {
              for (const handler of preHandlers) {
                await handler.call(this, request, reply);
              }
            });
          }

          // Typed Record view for dynamic child group lookups
          const versionEntries = versionHandlers as Record<
            string,
            UserHandler | FastifyGroupHandlers | undefined
          >;

          // Process children (top-level groups like 'products', 'users')
          if (versionGroup.children) {
            for (const [groupName, groupDef] of Object.entries(versionGroup.children)) {
              const groupHandlers = (versionEntries[groupName] ?? {}) as FastifyGroupHandlers;

              versionFastify.register(
                async (groupFastify) => {
                  registerGroupRoutes(groupFastify, groupDef, groupHandlers, options, version, [
                    groupName,
                  ]);
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

    // Register OpenAPI documentation route
    if (registerDocs) {
      const spec = generateSpec(contract, {
        info: docsConfig?.info ?? {
          title: 'API Documentation',
          version: '1.0.0',
        },
        ...(docsConfig?.servers && { servers: docsConfig.servers }),
      });

      fastify.get(docsPath, async (_request: FastifyRequest, reply: FastifyReply) => {
        return reply.send(spec);
      });
    }
  };

  return plugin;
}
