import type { ZodType } from 'zod';
import type { AuthType, HttpMethod, RouteDefinition, RouteExamples } from './types';
import { commonErrors, type ErrorSchemas, type ErrorStatusCode } from './helpers/errors';

/**
 * Type-level state a route accumulates while it is built.
 *
 * It keeps the literal method and path, the schema *types* (so both the Zod input type a
 * client sends and the output type a handler receives stay available), the declared status
 * codes with their schemas, and the auth type. Runtime values live on the route object.
 */
export type RouteState = {
  method: HttpMethod;
  path: string;
  body: ZodType | undefined;
  query: ZodType | undefined;
  params: ZodType | undefined;
  responses: Record<number, ZodType>;
  auth: AuthType | undefined;
};

/**
 * State of a route right after `route.get(path)` and friends
 */
export type InitialRouteState<M extends HttpMethod, P extends string> = {
  method: M;
  path: P;
  body: undefined;
  query: undefined;
  params: undefined;
  responses: Record<never, never>;
  auth: undefined;
};

/**
 * Replace one key of a route state
 */
export type WithRouteState<S extends RouteState, K extends keyof RouteState, V> = {
  [P in keyof S]: P extends K ? V : S[P];
};

/**
 * Merge two status → schema maps; entries in `B` win
 */
export type MergeResponses<A, B> = {
  [K in keyof A | keyof B]: K extends keyof B ? B[K] : K extends keyof A ? A[K] : never;
};

type WithResponses<S extends RouteState, M> = WithRouteState<
  S,
  'responses',
  MergeResponses<S['responses'], M>
>;

/**
 * A finalized route that can still be extended with metadata methods.
 * This allows chaining in any order (e.g., .returns().withAuth().withSummary())
 *
 * The builder methods use 'with*' prefix to avoid name conflicts with
 * RouteDefinition value properties, ensuring proper type inference.
 */
export type FinalRoute<S extends RouteState = RouteState, TResponse extends ZodType = ZodType> = {
  readonly method: S['method'];
  readonly path: S['path'];
  readonly body?: S['body'];
  readonly query?: S['query'];
  readonly params?: S['params'];
  readonly response: TResponse;
  readonly responses?: S['responses'];
  readonly auth?: S['auth'];
  readonly summary?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly deprecated?: boolean;
  readonly operationId?: string;
  readonly examples?: RouteExamples;
  readonly responseHeaders?: Record<string, ZodType<string>>;

  withAuth: <A extends AuthType>(type: A) => FinalRoute<WithRouteState<S, 'auth', A>, TResponse>;
  withSummary: (text: string) => FinalRoute<S, TResponse>;
  withDescription: (text: string) => FinalRoute<S, TResponse>;
  withTags: (...tags: string[]) => FinalRoute<S, TResponse>;
  markDeprecated: () => FinalRoute<S, TResponse>;
  withOperationId: (id: string) => FinalRoute<S, TResponse>;
  withResponses: <const M extends Record<number, ZodType>>(
    codes: M,
  ) => FinalRoute<WithResponses<S, M>, TResponse>;
  withErrors: <const C extends readonly ErrorStatusCode[]>(
    ...codes: C
  ) => FinalRoute<WithResponses<S, ErrorSchemas<C[number]>>, TResponse>;
  withExamples: (examples: RouteExamples) => FinalRoute<S, TResponse>;
  withResponseHeaders: (headers: Record<string, ZodType<string>>) => FinalRoute<S, TResponse>;
};

/**
 * Builds the runtime route object. Precise types are attached by `createFinalRoute`;
 * the runtime only ever sees plain schemas and strings.
 */
const buildFinalRoute = (config: RouteDefinition): FinalRoute => ({
  // Spread all RouteDefinition properties
  method: config.method,
  path: config.path,
  body: config.body,
  query: config.query,
  params: config.params,
  response: config.response,
  responses: config.responses,
  auth: config.auth,
  summary: config.summary,
  description: config.description,
  tags: config.tags,
  deprecated: config.deprecated,
  operationId: config.operationId,
  examples: config.examples,
  responseHeaders: config.responseHeaders,

  // Builder methods with 'with*' prefix
  withAuth: (type) => createFinalRoute({ ...config, auth: type }),
  withSummary: (text) => createFinalRoute({ ...config, summary: text }),
  withDescription: (text) => createFinalRoute({ ...config, description: text }),
  withTags: (...tags) => createFinalRoute({ ...config, tags: [...(config.tags ?? []), ...tags] }),
  markDeprecated: () => createFinalRoute({ ...config, deprecated: true }),
  withOperationId: (id) => createFinalRoute({ ...config, operationId: id }),
  withResponses: (codes) =>
    createFinalRoute({ ...config, responses: { ...config.responses, ...codes } }),
  withErrors: (...codes) =>
    createFinalRoute({
      ...config,
      responses: { ...config.responses, ...commonErrors(...codes) },
    }),
  withExamples: (examples) =>
    createFinalRoute({
      ...config,
      examples: {
        requestBody: { ...config.examples?.requestBody, ...examples.requestBody },
        responses: { ...config.examples?.responses, ...examples.responses },
      },
    }),
  withResponseHeaders: (headers) =>
    createFinalRoute({
      ...config,
      responseHeaders: { ...config.responseHeaders, ...headers },
    }),
});

/**
 * Factory function that creates an immutable route object with chainable methods.
 * Each method returns a new object (immutability preserved).
 */
const createFinalRoute = <S extends RouteState, R extends ZodType>(
  config: RouteDefinition,
): FinalRoute<S, R> => buildFinalRoute(config) as FinalRoute<S, R>;

/**
 * Builder class for creating type-safe route definitions
 * Uses a fluent API pattern for ergonomic route creation
 *
 * @example
 * ```ts
 * const getUser = route
 *   .get('/users/:id')
 *   .params(z.object({ id: z.uuid() }))
 *   .returns(UserSchema)
 *   .withAuth('bearer')
 *   .withSummary('Get a user by ID');
 * ```
 */
class RouteBuilder<S extends RouteState> {
  private readonly _method: HttpMethod;
  private readonly _path: string;
  private _body?: ZodType;
  private _query?: ZodType;
  private _params?: ZodType;
  private _responses?: Record<number, ZodType>;
  private _auth?: AuthType;
  private _summary?: string;
  private _description?: string;
  private _tags?: string[];
  private _deprecated?: boolean;
  private _operationId?: string;
  private _examples?: RouteExamples;
  private _responseHeaders?: Record<string, ZodType<string>>;

  constructor(method: HttpMethod, path: string) {
    this._method = method;
    this._path = path;
  }

  /**
   * Define the request body schema (for POST, PUT, PATCH)
   */
  body<B extends ZodType>(schema: B): RouteBuilder<WithRouteState<S, 'body', B>> {
    const builder = this._clone<WithRouteState<S, 'body', B>>();
    builder._body = schema;
    return builder;
  }

  /**
   * Define the query parameters schema
   */
  query<Q extends ZodType>(schema: Q): RouteBuilder<WithRouteState<S, 'query', Q>> {
    const builder = this._clone<WithRouteState<S, 'query', Q>>();
    builder._query = schema;
    return builder;
  }

  /**
   * Define the path parameters schema
   */
  params<P extends ZodType>(schema: P): RouteBuilder<WithRouteState<S, 'params', P>> {
    const builder = this._clone<WithRouteState<S, 'params', P>>();
    builder._params = schema;
    return builder;
  }

  /**
   * Define the success response schema (required)
   * This completes the route definition and returns a FinalRoute
   * that can still be extended with metadata methods in any order
   */
  returns<R extends ZodType>(schema: R): FinalRoute<S, R> {
    return createFinalRoute<S, R>({
      method: this._method,
      path: this._path,
      body: this._body,
      query: this._query,
      params: this._params,
      response: schema,
      responses: this._responses,
      auth: this._auth,
      summary: this._summary,
      description: this._description,
      tags: this._tags,
      deprecated: this._deprecated,
      operationId: this._operationId,
      examples: this._examples,
      responseHeaders: this._responseHeaders,
    });
  }

  /**
   * Add additional response schemas for different status codes
   */
  withResponses<const M extends Record<number, ZodType>>(
    codes: M,
  ): RouteBuilder<WithResponses<S, M>> {
    const builder = this._clone<WithResponses<S, M>>();
    builder._responses = { ...this._responses, ...codes };
    return builder;
  }

  /**
   * Add standard error response schemas for common HTTP status codes.
   * Shorthand for `.withResponses(commonErrors(...codes))`.
   */
  withErrors<const C extends readonly ErrorStatusCode[]>(
    ...codes: C
  ): RouteBuilder<WithResponses<S, ErrorSchemas<C[number]>>> {
    const builder = this._clone<WithResponses<S, ErrorSchemas<C[number]>>>();
    builder._responses = { ...this._responses, ...commonErrors(...codes) };
    return builder;
  }

  /**
   * Set the authentication type for this route
   */
  withAuth<A extends AuthType>(type: A): RouteBuilder<WithRouteState<S, 'auth', A>> {
    const builder = this._clone<WithRouteState<S, 'auth', A>>();
    builder._auth = type;
    return builder;
  }

  /**
   * Add a short summary for OpenAPI docs
   */
  withSummary(text: string): RouteBuilder<S> {
    const builder = this._clone<S>();
    builder._summary = text;
    return builder;
  }

  /**
   * Add a detailed description for OpenAPI docs
   */
  withDescription(text: string): RouteBuilder<S> {
    const builder = this._clone<S>();
    builder._description = text;
    return builder;
  }

  /**
   * Add tags for grouping in OpenAPI docs
   */
  withTags(...tags: string[]): RouteBuilder<S> {
    const builder = this._clone<S>();
    builder._tags = [...(this._tags ?? []), ...tags];
    return builder;
  }

  /**
   * Mark the route as deprecated
   */
  markDeprecated(): RouteBuilder<S> {
    const builder = this._clone<S>();
    builder._deprecated = true;
    return builder;
  }

  /**
   * Set a custom operation ID for OpenAPI docs
   */
  withOperationId(id: string): RouteBuilder<S> {
    const builder = this._clone<S>();
    builder._operationId = id;
    return builder;
  }

  /**
   * Define response headers that the handler may return via `withHeaders()`
   */
  withResponseHeaders(headers: Record<string, ZodType<string>>): RouteBuilder<S> {
    const builder = this._clone<S>();
    builder._responseHeaders = { ...this._responseHeaders, ...headers };
    return builder;
  }

  /**
   * Add request/response examples for OpenAPI docs
   */
  withExamples(examples: RouteExamples): RouteBuilder<S> {
    const builder = this._clone<S>();
    builder._examples = {
      requestBody: { ...this._examples?.requestBody, ...examples.requestBody },
      responses: { ...this._examples?.responses, ...examples.responses },
    };
    return builder;
  }

  /**
   * Clone the builder to maintain immutability
   */
  private _clone<T extends RouteState>(): RouteBuilder<T> {
    const builder = new RouteBuilder<T>(this._method, this._path);
    builder._body = this._body;
    builder._query = this._query;
    builder._params = this._params;
    builder._responses = this._responses;
    builder._auth = this._auth;
    builder._summary = this._summary;
    builder._description = this._description;
    builder._tags = this._tags ? [...this._tags] : undefined;
    builder._deprecated = this._deprecated;
    builder._operationId = this._operationId;
    builder._examples = this._examples;
    builder._responseHeaders = this._responseHeaders;
    return builder;
  }
}

export type { RouteBuilder };

/**
 * Factory functions for creating route builders
 *
 * @example
 * ```ts
 * import { route } from '@typeful-api/core';
 *
 * const listProducts = route.get('/products')
 *   .query(z.object({ page: z.number().optional() }))
 *   .returns(z.array(ProductSchema));
 *
 * const createProduct = route.post('/products')
 *   .body(ProductInputSchema)
 *   .withAuth('bearer')
 *   .returns(ProductSchema);
 * ```
 */
export const route = {
  /**
   * Create a GET route
   */
  get: <P extends string>(path: P) => new RouteBuilder<InitialRouteState<'get', P>>('get', path),

  /**
   * Create a POST route
   */
  post: <P extends string>(path: P) => new RouteBuilder<InitialRouteState<'post', P>>('post', path),

  /**
   * Create a PUT route
   */
  put: <P extends string>(path: P) => new RouteBuilder<InitialRouteState<'put', P>>('put', path),

  /**
   * Create a PATCH route
   */
  patch: <P extends string>(path: P) =>
    new RouteBuilder<InitialRouteState<'patch', P>>('patch', path),

  /**
   * Create a DELETE route
   */
  delete: <P extends string>(path: P) =>
    new RouteBuilder<InitialRouteState<'delete', P>>('delete', path),
} as const;
