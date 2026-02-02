import type {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
  FastifyPluginCallback,
  preHandlerHookHandler,
} from 'fastify';
import type {
  ApiContract,
  InferBody,
  InferParams,
  InferQuery,
  InferResponse,
  RouteDefinition,
  RouteGroup,
} from '@typi/core';

/**
 * Typed Fastify request with inferred body, query, and params
 */
export type TypedFastifyRequest<R extends RouteDefinition> = FastifyRequest<{
  Body: InferBody<R>;
  Querystring: InferQuery<R>;
  Params: InferParams<R>;
}>;

/**
 * Handler context for Fastify routes
 */
export type FastifyRouteContext<R extends RouteDefinition> = {
  request: TypedFastifyRequest<R>;
  reply: FastifyReply;
  body: InferBody<R>;
  query: InferQuery<R>;
  params: InferParams<R>;
};

/**
 * Handler function type for Fastify routes
 */
export type FastifyHandler<R extends RouteDefinition> = (
  ctx: FastifyRouteContext<R>,
) => Promise<InferResponse<R>> | InferResponse<R>;

/**
 * Recursively infer handler types from a route group for Fastify
 */
export type InferFastifyGroupHandlers<G extends RouteGroup> =
  (G['routes'] extends Record<string, RouteDefinition>
    ? {
        [K in keyof G['routes']]: FastifyHandler<G['routes'][K]>;
      }
    : object) &
    (G['children'] extends Record<string, RouteGroup>
      ? {
          [K in keyof G['children']]: InferFastifyGroupHandlers<
            G['children'][K]
          >;
        }
      : object);

/**
 * Infer all handlers from an API contract for Fastify
 */
export type InferFastifyHandlers<C extends ApiContract> = {
  [VK in keyof C]: {
    preHandler?: preHandlerHookHandler | preHandlerHookHandler[];
  } & (C[VK]['children'] extends Record<string, RouteGroup>
    ? {
        [CK in keyof C[VK]['children']]: InferFastifyGroupHandlers<
          C[VK]['children'][CK]
        > & {
          preHandler?: preHandlerHookHandler | preHandlerHookHandler[];
        };
      }
    : object);
};

/**
 * Options for creating a Fastify plugin
 */
export type CreateFastifyPluginOptions = {
  /**
   * Prefix for all routes (e.g., '/api')
   */
  prefix?: string;

  /**
   * Global preHandler hooks applied to all routes
   */
  preHandler?: preHandlerHookHandler | preHandlerHookHandler[];

  /**
   * Whether to use Fastify's native schema validation with Zod
   * Requires @fastify/type-provider-zod to be registered
   * @default false
   */
  useNativeValidation?: boolean;

  /**
   * Custom error handler for validation errors
   */
  errorHandler?: (error: Error, request: FastifyRequest, reply: FastifyReply) => void;
};

/**
 * Decorator interface for typed request locals
 */
export type FastifyLocals<T> = {
  locals: T;
};

/**
 * Extended FastifyRequest with typed locals
 */
export type RequestWithLocals<T> = FastifyRequest & FastifyLocals<T>;

/**
 * Type helper for Fastify plugin with typed options
 */
export type TypedFastifyPlugin<T = unknown> = FastifyPluginCallback<T>;
