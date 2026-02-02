import type { ZodSchema } from 'zod';
import type { AuthType, HttpMethod, RouteDefinition } from './types';

/**
 * Builder class for creating type-safe route definitions
 * Uses a fluent API pattern for ergonomic route creation
 *
 * @example
 * ```ts
 * const getUser = route
 *   .get('/users/:id')
 *   .params(z.object({ id: z.string().uuid() }))
 *   .returns(UserSchema)
 *   .auth('bearer')
 *   .summary('Get a user by ID');
 * ```
 */
class RouteBuilder<
  TBody = never,
  TQuery = never,
  TParams = never,
  TResponse = never,
> {
  private readonly _method: HttpMethod;
  private readonly _path: string;
  private _body?: ZodSchema<TBody>;
  private _query?: ZodSchema<TQuery>;
  private _params?: ZodSchema<TParams>;
  private _response?: ZodSchema<TResponse>;
  private _responses?: Record<number, ZodSchema>;
  private _auth?: AuthType;
  private _summary?: string;
  private _description?: string;
  private _tags?: string[];
  private _deprecated?: boolean;
  private _operationId?: string;

  constructor(method: HttpMethod, path: string) {
    this._method = method;
    this._path = path;
  }

  /**
   * Define the request body schema (for POST, PUT, PATCH)
   */
  body<T>(schema: ZodSchema<T>): RouteBuilder<T, TQuery, TParams, TResponse> {
    const builder = this._clone<T, TQuery, TParams, TResponse>();
    builder._body = schema as unknown as ZodSchema<T>;
    return builder;
  }

  /**
   * Define the query parameters schema
   */
  query<T>(schema: ZodSchema<T>): RouteBuilder<TBody, T, TParams, TResponse> {
    const builder = this._clone<TBody, T, TParams, TResponse>();
    builder._query = schema as unknown as ZodSchema<T>;
    return builder;
  }

  /**
   * Define the path parameters schema
   */
  params<T>(schema: ZodSchema<T>): RouteBuilder<TBody, TQuery, T, TResponse> {
    const builder = this._clone<TBody, TQuery, T, TResponse>();
    builder._params = schema as unknown as ZodSchema<T>;
    return builder;
  }

  /**
   * Define the success response schema (required)
   * This completes the route definition
   */
  returns<T>(schema: ZodSchema<T>): RouteDefinition<TBody, TQuery, TParams, T> {
    return {
      method: this._method,
      path: this._path,
      body: this._body as ZodSchema<TBody> | undefined,
      query: this._query as ZodSchema<TQuery> | undefined,
      params: this._params as ZodSchema<TParams> | undefined,
      response: schema,
      responses: this._responses,
      auth: this._auth,
      summary: this._summary,
      description: this._description,
      tags: this._tags,
      deprecated: this._deprecated,
      operationId: this._operationId,
    } as const;
  }

  /**
   * Add additional response schemas for different status codes
   */
  responses(
    codes: Record<number, ZodSchema>,
  ): RouteBuilder<TBody, TQuery, TParams, TResponse> {
    const builder = this._clone<TBody, TQuery, TParams, TResponse>();
    builder._responses = { ...this._responses, ...codes };
    return builder;
  }

  /**
   * Set the authentication type for this route
   */
  auth(type: AuthType): RouteBuilder<TBody, TQuery, TParams, TResponse> {
    const builder = this._clone<TBody, TQuery, TParams, TResponse>();
    builder._auth = type;
    return builder;
  }

  /**
   * Add a short summary for OpenAPI docs
   */
  summary(text: string): RouteBuilder<TBody, TQuery, TParams, TResponse> {
    const builder = this._clone<TBody, TQuery, TParams, TResponse>();
    builder._summary = text;
    return builder;
  }

  /**
   * Add a detailed description for OpenAPI docs
   */
  description(text: string): RouteBuilder<TBody, TQuery, TParams, TResponse> {
    const builder = this._clone<TBody, TQuery, TParams, TResponse>();
    builder._description = text;
    return builder;
  }

  /**
   * Add tags for grouping in OpenAPI docs
   */
  tags(...tags: string[]): RouteBuilder<TBody, TQuery, TParams, TResponse> {
    const builder = this._clone<TBody, TQuery, TParams, TResponse>();
    builder._tags = [...(this._tags ?? []), ...tags];
    return builder;
  }

  /**
   * Mark the route as deprecated
   */
  deprecated(): RouteBuilder<TBody, TQuery, TParams, TResponse> {
    const builder = this._clone<TBody, TQuery, TParams, TResponse>();
    builder._deprecated = true;
    return builder;
  }

  /**
   * Set a custom operation ID for OpenAPI docs
   */
  operationId(id: string): RouteBuilder<TBody, TQuery, TParams, TResponse> {
    const builder = this._clone<TBody, TQuery, TParams, TResponse>();
    builder._operationId = id;
    return builder;
  }

  /**
   * Clone the builder to maintain immutability
   */
  private _clone<B, Q, P, R>(): RouteBuilder<B, Q, P, R> {
    const builder = new RouteBuilder<B, Q, P, R>(this._method, this._path);
    builder._body = this._body as unknown as ZodSchema<B> | undefined;
    builder._query = this._query as unknown as ZodSchema<Q> | undefined;
    builder._params = this._params as unknown as ZodSchema<P> | undefined;
    builder._response = this._response as unknown as ZodSchema<R> | undefined;
    builder._responses = this._responses;
    builder._auth = this._auth;
    builder._summary = this._summary;
    builder._description = this._description;
    builder._tags = this._tags ? [...this._tags] : undefined;
    builder._deprecated = this._deprecated;
    builder._operationId = this._operationId;
    return builder;
  }
}

/**
 * Factory functions for creating route builders
 *
 * @example
 * ```ts
 * import { route } from '@typi/core';
 *
 * const listProducts = route.get('/products')
 *   .query(z.object({ page: z.number().optional() }))
 *   .returns(z.array(ProductSchema));
 *
 * const createProduct = route.post('/products')
 *   .body(ProductInputSchema)
 *   .returns(ProductSchema)
 *   .auth('bearer');
 * ```
 */
export const route = {
  /**
   * Create a GET route
   */
  get: (path: string) => new RouteBuilder('get', path),

  /**
   * Create a POST route
   */
  post: (path: string) => new RouteBuilder('post', path),

  /**
   * Create a PUT route
   */
  put: (path: string) => new RouteBuilder('put', path),

  /**
   * Create a PATCH route
   */
  patch: (path: string) => new RouteBuilder('patch', path),

  /**
   * Create a DELETE route
   */
  delete: (path: string) => new RouteBuilder('delete', path),
} as const;
