import type {
  FastifyError,
  FastifyInstance,
  FastifyPluginCallback,
  FastifyRequest,
  FastifyReply,
  RouteShorthandOptions,
  preHandlerAsyncHookHandler,
} from 'fastify';
import type { ZodType } from 'zod';
import type {
  ApiContract,
  AuthConfig,
  AuthType,
  HttpMethod,
  ProblemDetails,
  RequestLocation,
  RouteDefinition,
  RouteGroup,
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
import type { CreateFastifyPluginOptions, InferFastifyHandlers } from './types';
import { mergeLocals } from './helpers';

/**
 * Send an RFC 9457 Problem Details response
 */
function sendProblem(
  reply: FastifyReply,
  problem: ProblemDetails,
  headers: Readonly<Record<string, string>> = {},
): FastifyReply {
  return reply
    .code(problem.status)
    .headers(headers)
    .type(PROBLEM_CONTENT_TYPE)
    .send(JSON.stringify(problem));
}

/**
 * Read a request header as a single string
 */
function readHeader(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Create a preHandler hook that enforces auth for a route.
 */
function createAuthPreHandler(
  authType: AuthType,
  authConfig: AuthConfig,
): preHandlerAsyncHookHandler | null {
  const authenticate = createAuthenticator(authType, authConfig);
  if (!authenticate) return null;

  return async (request, reply) => {
    const result = await authenticate((name) => readHeader(request, name));
    if (!result.ok) return sendProblem(reply, result.error.problem, result.error.headers);
    mergeLocals(request, { authUser: result.user });
  };
}

/**
 * Create a preHandler hook that validates query, params and body (in that order). Invalid
 * input never reaches the handler: if `onValidationError` does not send a response, the
 * default 422 problem is sent.
 */
function createValidationPreHandler(
  route: RouteDefinition,
  options: CreateFastifyPluginOptions,
): preHandlerAsyncHookHandler {
  const checks: Array<[RequestLocation, ZodType | undefined]> = [
    ['query', route.query],
    ['params', route.params],
    ['body', ['post', 'put', 'patch'].includes(route.method) ? route.body : undefined],
  ];

  return async (request, reply) => {
    for (const [location, schema] of checks) {
      if (!schema) continue;
      const result = await schema.safeParseAsync(request[location]);
      if (!result.success) {
        const error = toValidationError(location, result.error);
        await options.onValidationError?.(error, request, reply);
        return reply.sent ? reply : sendProblem(reply, error.problem);
      }
      request[location] = result.data;
    }
  };
}

const clientErrorDetails: Record<string, string> = {
  FST_ERR_CTP_INVALID_JSON_BODY: 'Malformed JSON in request body',
};

/**
 * Plugin error handler: `HttpError`s and Fastify's own 4xx body parsing errors (malformed
 * JSON, unsupported media type, body too large) become Problem Details. Anything else goes to
 * the `errorHandler` option, or is rethrown to the parent context's error handler.
 */
function createProblemErrorHandler(options: CreateFastifyPluginOptions) {
  return async function (
    this: FastifyInstance,
    error: FastifyError,
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    if (isHttpError(error)) return sendProblem(reply, error.problem, error.headers);

    const { code, statusCode } = error;
    if (
      typeof code === 'string' &&
      code.startsWith('FST_ERR_CTP_') &&
      statusCode &&
      statusCode < 500
    ) {
      const detail = clientErrorDetails[code] ?? error.message;
      return sendProblem(reply, createProblem(statusCode, { detail }));
    }

    if (options.errorHandler) return options.errorHandler.call(this, error, request, reply);
    throw error;
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
        preHandler: [
          ...groupPreHandlers,
          ...(route.auth && route.auth !== 'none' && options.auth
            ? [createAuthPreHandler(route.auth, options.auth)].filter(Boolean)
            : []),
          createValidationPreHandler(route, options),
        ] as preHandlerAsyncHookHandler[],
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
        if (isWithHeaders(result)) {
          reply.headers(result.headers);
          return reply.send(result.body);
        }
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
  const prefix = (options.prefix ?? '').replace(/\/+$/, '');

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

    // Problem Details for HttpError and body parsing errors; everything else goes to the
    // errorHandler option or the parent context
    fastify.setErrorHandler(createProblemErrorHandler(options));

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
        { prefix: `${prefix}/${version}` },
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
        ...(docsConfig?.openapiVersion && { openapiVersion: docsConfig.openapiVersion }),
      });

      fastify.get(`${prefix}${docsPath}`, async (_request: FastifyRequest, reply: FastifyReply) => {
        return reply.send(spec);
      });
    }
  };

  return plugin;
}
