import type { HttpMethod } from '../types';
import { createCaller, type Caller } from './request';
import type { ClientOptions, Empty, Optional, RequestOptions, Simplify } from './types';

/**
 * One route in a generated route map: the HTTP method, the OpenAPI path template and the
 * statuses the spec documents for it
 */
export type SpecRoute = {
  readonly method: HttpMethod;
  readonly path: string;
  readonly statuses: readonly number[];
};

/**
 * A generated route map: nested groups whose leaves are routes
 */
export type SpecRoutes = { readonly [key: string]: SpecRoute | SpecRoutes };

/**
 * Options for a client generated from an OpenAPI spec. Responses cannot be validated (there are
 * no Zod schemas), so `validateResponse` is not available.
 */
export type SpecClientOptions = Omit<ClientOptions, 'validateResponse'>;

/** The openapi-typescript operation type for a route: `paths[path][method]` */
type OperationOf<Paths, R> = R extends { path: infer P; method: infer M }
  ? P extends keyof Paths
    ? M extends keyof Paths[P]
      ? NonNullable<Paths[P][M]>
      : never
    : never
  : never;

type PathParamsOf<O> = O extends { parameters: { path?: infer P } } ? NonNullable<P> : never;
type QueryOf<O> = O extends { parameters: { query?: infer Q } } ? NonNullable<Q> : never;

type JsonContent<C> = C extends { 'application/json': infer J }
  ? J
  : C extends { 'application/problem+json': infer P }
    ? P
    : C[keyof C];

type RequestBodyOf<O> = O extends { requestBody?: infer B }
  ? NonNullable<B> extends { content: infer C }
    ? JsonContent<C>
    : never
  : never;

type BodyIsRequired<O> = O extends { requestBody: { content: unknown } } ? true : false;

type SpecParamsArg<O> = [PathParamsOf<O>] extends [never]
  ? { params?: never }
  : Optional<'params', PathParamsOf<O>>;

type SpecQueryArg<O> = [QueryOf<O>] extends [never]
  ? { query?: never }
  : Optional<'query', QueryOf<O>>;

type SpecBodyArg<O> = [RequestBodyOf<O>] extends [never]
  ? { body?: never }
  : BodyIsRequired<O> extends true
    ? { body: RequestBodyOf<O> }
    : { body?: RequestBodyOf<O> };

/**
 * Arguments of a generated client function, from the operation's path parameters, query
 * parameters and JSON request body
 */
export type SpecArgs<O> = Simplify<
  SpecParamsArg<O> & SpecQueryArg<O> & SpecBodyArg<O> & RequestOptions
>;

type ResponsesOf<O> = O extends { responses: infer R } ? R : never;
type ResponseBody<R> = R extends { content: infer C } ? JsonContent<C> : undefined;

/**
 * Result of a generated client function: a union discriminated by `status` over the documented
 * responses
 */
export type SpecResponse<O> = {
  [S in keyof ResponsesOf<O> & number]: {
    status: S;
    body: ResponseBody<ResponsesOf<O>[S]>;
    headers: Headers;
  };
}[keyof ResponsesOf<O> & number];

/**
 * A client function for one operation
 */
export type SpecCaller<O> =
  Empty extends SpecArgs<O>
    ? (args?: SpecArgs<O>) => Promise<SpecResponse<O>>
    : (args: SpecArgs<O>) => Promise<SpecResponse<O>>;

/**
 * A client created from a route map and the `paths` type openapi-typescript generates
 */
export type SpecClient<R, Paths> = {
  [K in keyof R]: R[K] extends SpecRoute
    ? SpecCaller<OperationOf<Paths, R[K]>>
    : SpecClient<R[K], Paths>;
};

type ClientNode = { [key: string]: ClientNode | Caller };

const isSpecRoute = (value: SpecRoute | SpecRoutes): value is SpecRoute =>
  typeof value.path === 'string' &&
  typeof value.method === 'string' &&
  Array.isArray(value.statuses);

const build = (routes: SpecRoutes, options: SpecClientOptions): ClientNode =>
  Object.fromEntries(
    Object.entries(routes).map(([key, value]) => [
      key,
      isSpecRoute(value)
        ? createCaller(
            {
              method: value.method,
              path: value.path,
              responses: new Map(value.statuses.map((status) => [status, undefined])),
            },
            options,
          )
        : build(value, options),
    ]),
  );

/**
 * Creates a typed client from a route map and openapi-typescript types, as written by
 * `typeful-api generate-client --out <file>.ts`. Generated modules export a ready-made
 * `createApiClient(options)` that calls this, so you rarely need it directly.
 *
 * Calls work like the contract client: `{ params, query, body }` in, `{ status, body, headers }`
 * out, and undocumented statuses throw `UnexpectedResponseError`.
 */
export function createSpecClient<R extends SpecRoutes, Paths>(
  routes: R,
  options: SpecClientOptions,
): SpecClient<R, Paths> {
  return build(routes, options) as unknown as SpecClient<R, Paths>;
}
