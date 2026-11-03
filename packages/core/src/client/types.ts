import type { z, ZodType } from 'zod';
import type { ErrorSchemaFor } from '../helpers/errors';
import type { MergeResponses } from '../route';
import type { ApiContract } from '../types';

type Simplify<T> = { [K in keyof T]: T[K] } & {};
type Empty = Record<never, never>;

type SchemaSlot = 'body' | 'query' | 'params';

/** The schema a route defines for a slot, or `never` */
type Slot<R, K extends SchemaSlot> = K extends keyof R
  ? NonNullable<R[K]> extends ZodType
    ? NonNullable<R[K]>
    : never
  : never;

/** Adapters only read a request body for POST, PUT and PATCH */
type BodySlot<R> = R extends { method: 'post' | 'put' | 'patch' } ? Slot<R, 'body'> : never;

type PathOf<R> = R extends { path: infer P extends string } ? P : string;

/** `'/:id/items/:itemId'` → `'id' | 'itemId'` */
type PathParamNames<P extends string> = P extends `${string}:${infer Name}/${infer Rest}`
  ? Name | PathParamNames<`/${Rest}`>
  : P extends `${string}:${infer Name}`
    ? Name
    : never;

/** `{ key: T }`, or `{ key?: T }` when every field of T is optional */
type Optional<K extends string, T> = Empty extends T ? { [P in K]?: T } : { [P in K]: T };

type ParamsArg<R> = [Slot<R, 'params'>] extends [never]
  ? string extends PathOf<R>
    ? { params?: Record<string, string | number> }
    : [PathParamNames<PathOf<R>>] extends [never]
      ? { params?: never }
      : { params: Record<PathParamNames<PathOf<R>>, string | number> }
  : Optional<'params', z.input<Slot<R, 'params'>>>;

type QueryArg<R> = [Slot<R, 'query'>] extends [never]
  ? { query?: never }
  : Optional<'query', z.input<Slot<R, 'query'>>>;

type BodyArg<R> = [BodySlot<R>] extends [never]
  ? { body?: never }
  : Optional<'body', z.input<BodySlot<R>>>;

/**
 * Per-request options accepted by every client call
 */
export type RequestOptions = {
  /** Extra request headers; `undefined` removes a header set by the client options */
  headers?: Record<string, string | undefined>;
  /** Abort the request */
  signal?: AbortSignal;
  /** Other `fetch` options, such as `credentials` or `cache` */
  fetchOptions?: Omit<RequestInit, 'method' | 'body' | 'headers' | 'signal'>;
};

/**
 * Arguments of a client call: `params`, `query` and `body` as the API accepts them (Zod input
 * types, so fields with defaults are optional), plus request options
 */
export type RouteArgs<R> = Simplify<ParamsArg<R> & QueryArg<R> & BodyArg<R> & RequestOptions>;

type HasInput<R> = [Slot<R, 'params'> | Slot<R, 'query'> | BodySlot<R>] extends [never]
  ? false
  : true;

type HasAuth<R> = R extends { auth?: infer A }
  ? [Exclude<NonNullable<A>, 'none'>] extends [never]
    ? false
    : true
  : false;

/** Responses adapters send on their own: 422 for invalid input, 401 for failed auth */
type ImplicitResponses<R> = (HasInput<R> extends true ? { 422: ErrorSchemaFor<422> } : Empty) &
  (HasAuth<R> extends true ? { 401: ErrorSchemaFor<401> } : Empty);

type DeclaredResponses<R> = R extends { responses?: infer M }
  ? NonNullable<M> extends Record<number, ZodType>
    ? NonNullable<M>
    : Empty
  : Empty;

type ResponseSchema<R> = R extends { response: infer S } ? S : never;

/** Status code → schema for every status the route can answer with */
type RouteResponses<R> = MergeResponses<ImplicitResponses<R>, DeclaredResponses<R>> & {
  200: ResponseSchema<R>;
};

/**
 * Result of a client call: a union discriminated by `status`, covering the 200 response, the
 * declared responses and the implicit 401/422 responses
 */
export type ClientResponse<R> = {
  [S in keyof RouteResponses<R> & number]: {
    status: S;
    body: z.output<RouteResponses<R>[S]>;
    headers: Headers;
  };
}[keyof RouteResponses<R> & number];

/**
 * A client function for one route. The argument is optional when nothing in it is required.
 */
export type RouteCaller<R> =
  Empty extends RouteArgs<R>
    ? (args?: RouteArgs<R>) => Promise<ClientResponse<R>>
    : (args: RouteArgs<R>) => Promise<ClientResponse<R>>;

type GroupClient<G> = (G extends { routes: infer Routes }
  ? { [K in keyof Routes]: RouteCaller<Routes[K]> }
  : Empty) &
  (G extends { children: infer Children }
    ? { [K in keyof Children]: GroupClient<Children[K]> }
    : Empty);

/**
 * The client object: mirrors the contract (version → groups → routes)
 */
export type ContractClient<C extends ApiContract> = { [V in keyof C]: GroupClient<C[V]> };

/**
 * Options for `createClient`
 */
export type ClientOptions = {
  /** Where the API is mounted, e.g. `https://api.example.com` or `/api` */
  baseUrl: string;
  /** Custom fetch, e.g. for testing or to add retries. Defaults to the global `fetch`. */
  fetch?: (input: string, init: RequestInit) => Promise<Response>;
  /** Headers for every request; a function is called per request (e.g. for fresh tokens) */
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  /** `fetch` options for every request, such as `credentials: 'include'` */
  fetchOptions?: RequestOptions['fetchOptions'];
  /**
   * Parse response bodies with their Zod schema. Applies transforms (e.g. string → Date)
   * and throws `ResponseValidationError` when a body does not match.
   * @default false
   */
  validateResponse?: boolean;
};

/**
 * Arguments of a client function, e.g. `InferClientArgs<typeof client.v1.products.list>`
 */
export type InferClientArgs<F> = F extends (...args: infer A) => unknown
  ? NonNullable<A[0]>
  : never;

/**
 * Response union of a client function
 */
export type InferClientResponse<F> = F extends (...args: never[]) => Promise<infer Res>
  ? Res
  : never;

/**
 * Body type of a client function's response for a status (200 by default)
 */
export type InferClientBody<F, S extends number = 200> =
  Extract<InferClientResponse<F>, { status: S }> extends { body: infer B } ? B : never;
