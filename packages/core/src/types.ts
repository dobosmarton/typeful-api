import type { z, ZodType } from 'zod';

/**
 * Supported HTTP methods
 */
export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * Authentication types supported out of the box
 */
export type AuthType = 'bearer' | 'apiKey' | 'basic' | 'none';

/**
 * A named example for OpenAPI documentation
 */
export type RouteExample = {
  summary?: string;
  description?: string;
  value: unknown;
};

/**
 * Examples configuration for a route's request body and responses.
 * Keys in each record are example names (e.g., 'simple', 'withOptionalFields').
 */
export type RouteExamples = {
  requestBody?: Record<string, RouteExample>;
  responses?: Record<number, Record<string, RouteExample>>;
};

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
  readonly body?: ZodType<TBody>;
  readonly query?: ZodType<TQuery>;
  readonly params?: ZodType<TParams>;
  readonly response: ZodType<TResponse>;
  readonly responses?: Record<number, ZodType>;
  readonly auth?: AuthType;
  readonly summary?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly deprecated?: boolean;
  readonly operationId?: string;
  readonly examples?: RouteExamples;
  readonly responseHeaders?: Record<string, ZodType<string>>;
};

/**
 * Tagged return value that includes both a JSON body and response headers.
 * Produced by the `withHeaders()` helper from `@typeful-api/core`.
 */
export type WithResponseHeaders<TBody, THeaders extends Record<string, string>> = {
  readonly __typefulHeaders: true;
  readonly body: TBody;
  readonly headers: THeaders;
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
 * Parsed (output) type of a schema slot, or `never` when the route does not define it.
 * The tuple wrapper keeps an unset slot (`never` after `NonNullable`) resolving to `never`
 * instead of `unknown`.
 */
type SlotOutput<S> = [S] extends [never] ? never : S extends ZodType ? z.output<S> : never;

/**
 * Raw (input) type of a schema slot, i.e. what a caller sends before defaults and
 * coercion are applied, or `never` when the route does not define it.
 */
type SlotInput<S> = [S] extends [never] ? never : S extends ZodType ? z.input<S> : never;

/**
 * Extract the parsed body type from a route definition (what handlers receive)
 */
export type InferBody<R extends RouteDefinition> = SlotOutput<NonNullable<R['body']>>;

/**
 * Extract the parsed query type from a route definition (what handlers receive)
 */
export type InferQuery<R extends RouteDefinition> = SlotOutput<NonNullable<R['query']>>;

/**
 * Extract the parsed params type from a route definition (what handlers receive)
 */
export type InferParams<R extends RouteDefinition> = SlotOutput<NonNullable<R['params']>>;

/**
 * Extract the response type from a route definition
 */
export type InferResponse<R extends RouteDefinition> = SlotOutput<R['response']>;

/**
 * Extract the body type a client sends (before defaults and transforms)
 */
export type InferBodyInput<R extends RouteDefinition> = SlotInput<NonNullable<R['body']>>;

/**
 * Extract the query type a client sends (before defaults and coercion)
 */
export type InferQueryInput<R extends RouteDefinition> = SlotInput<NonNullable<R['query']>>;

/**
 * Extract the path params type a client sends (before coercion)
 */
export type InferParamsInput<R extends RouteDefinition> = SlotInput<NonNullable<R['params']>>;

/**
 * What a handler may return: the response body, or the body wrapped with `withHeaders()`
 */
export type HandlerResult<R extends RouteDefinition> =
  InferResponse<R> | WithResponseHeaders<InferResponse<R>, Record<string, string>>;

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
) => Promise<HandlerResult<R>> | HandlerResult<R>;

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
  /**
   * OpenAPI version to generate.
   * - `'3.0'` (default): OpenAPI 3.0.0 with JSON Schema draft-7
   * - `'3.1'`: OpenAPI 3.1.0 with JSON Schema 2020-12
   */
  openapiVersion?: '3.0' | '3.1';
};
