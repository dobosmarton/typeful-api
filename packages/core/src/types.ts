import type { ZodSchema, z } from 'zod';

/**
 * Supported HTTP methods
 */
export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * Authentication types supported out of the box
 */
export type AuthType = 'bearer' | 'apiKey' | 'basic' | 'none';

/**
 * A route definition containing all metadata needed for:
 * - Type inference for handlers
 * - OpenAPI spec generation
 * - Request/response validation
 */
export type RouteDefinition<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown,
  TResponse = unknown,
> = {
  readonly method: HttpMethod;
  readonly path: string;
  readonly body?: ZodSchema<TBody>;
  readonly query?: ZodSchema<TQuery>;
  readonly params?: ZodSchema<TParams>;
  readonly response: ZodSchema<TResponse>;
  readonly responses?: Record<number, ZodSchema>;
  readonly auth?: AuthType;
  readonly summary?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly deprecated?: boolean;
  readonly operationId?: string;
};

/**
 * A collection of named routes (leaves in the route tree)
 */
export type RouteLeaves = Record<string, RouteDefinition>;

/**
 * A route group containing optional middleware config, routes, and nested groups
 */
export type RouteGroup = {
  readonly routes?: RouteLeaves;
  readonly children?: Record<string, RouteGroup>;
  readonly middleware?: readonly string[];
  readonly tags?: readonly string[];
};

/**
 * Versioned routes: v1, v2, etc. mapping to top-level groups
 */
export type VersionedRoutes = Record<string, RouteGroup>;

/**
 * Full API contract containing all versions
 */
export type ApiContract = VersionedRoutes;

/**
 * Extract the body type from a route definition
 * Uses NonNullable to handle the optional nature of body
 */
export type InferBody<R extends RouteDefinition> =
  NonNullable<R['body']> extends ZodSchema<infer T> ? T : never;

/**
 * Extract the query type from a route definition
 * Uses NonNullable to handle the optional nature of query
 */
export type InferQuery<R extends RouteDefinition> =
  NonNullable<R['query']> extends ZodSchema<infer T> ? T : never;

/**
 * Extract the params type from a route definition
 * Uses NonNullable to handle the optional nature of params
 */
export type InferParams<R extends RouteDefinition> =
  NonNullable<R['params']> extends ZodSchema<infer T> ? T : never;

/**
 * Extract the response type from a route definition
 */
export type InferResponse<R extends RouteDefinition> =
  R['response'] extends ZodSchema<infer T> ? T : never;

/**
 * Context object passed to handlers, containing typed request data
 */
export type RouteContext<R extends RouteDefinition> = {
  body: InferBody<R>;
  query: InferQuery<R>;
  params: InferParams<R>;
};

/**
 * Generic handler function type (framework-agnostic)
 */
export type HandlerFn<R extends RouteDefinition, TContext = unknown> = (
  ctx: TContext & RouteContext<R>,
) => Promise<InferResponse<R>> | InferResponse<R>;

/**
 * Recursively infer handler types from a route group
 */
export type InferGroupHandlers<G extends RouteGroup, TContext> = (G['routes'] extends RouteLeaves
  ? {
      [K in keyof G['routes']]: HandlerFn<G['routes'][K], TContext>;
    }
  : object) &
  (G['children'] extends Record<string, RouteGroup>
    ? {
        [K in keyof G['children']]: InferGroupHandlers<G['children'][K], TContext>;
      }
    : object);

/**
 * Infer all handlers from an API contract
 */
export type InferHandlers<C extends ApiContract, TContext = unknown> = {
  [V in keyof C]: InferGroupHandlers<C[V], TContext>;
};

/**
 * Compose context types (inspired by WithVariables pattern)
 * Allows layering additional variables onto a base context
 */
export type WithContext<TBase, TExtra> = TBase & {
  variables: TBase extends { variables: infer V } ? V & TExtra : TExtra;
};

/**
 * OpenAPI info object
 */
export type OpenApiInfo = {
  title: string;
  version: string;
  description?: string;
  termsOfService?: string;
  contact?: {
    name?: string;
    url?: string;
    email?: string;
  };
  license?: {
    name: string;
    url?: string;
  };
};

/**
 * OpenAPI server object
 */
export type OpenApiServer = {
  url: string;
  description?: string;
};

/**
 * Options for generating OpenAPI spec
 */
export type GenerateSpecOptions = {
  info: OpenApiInfo;
  servers?: OpenApiServer[];
  externalDocs?: {
    description?: string;
    url: string;
  };
};
