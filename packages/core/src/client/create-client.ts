import type { ZodType } from 'zod';
import { flattenRoutes } from '../contract';
import { PATH_PARAM_PATTERN } from '../path';
import { resolveRouteResponses } from '../responses';
import type { ApiContract, HttpMethod, RouteDefinition } from '../types';
import { ResponseValidationError, UnexpectedResponseError } from './errors';
import type { ClientOptions, ContractClient, RequestOptions } from './types';

type CallArgs = RequestOptions & { params?: object; query?: object; body?: unknown };
type Caller = (args?: CallArgs) => Promise<{ status: number; body: unknown; headers: Headers }>;
type ClientNode = { [key: string]: ClientNode | Caller };

const BODY_METHODS: ReadonlySet<HttpMethod> = new Set(['post', 'put', 'patch']);
const NO_BODY_STATUSES: ReadonlySet<number> = new Set([204, 205, 304]);
const JSON_CONTENT_TYPE = /^application\/(?:[\w.+-]+\+)?json\s*(?:;|$)/i;
const DEFAULT_ACCEPT = 'application/json, application/problem+json';

const interpolatePath = (template: string, params: object | undefined, method: string): string =>
  template.replace(PATH_PARAM_PATTERN, (_match, name: string) => {
    const value = (params as Record<string, unknown> | undefined)?.[name];
    if (value === undefined || value === null) {
      throw new TypeError(
        `Missing path parameter "${name}" for ${method.toUpperCase()} ${template}`,
      );
    }
    return encodeURIComponent(String(value));
  });

const serializeQueryValue = (key: string, value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    throw new TypeError(
      `Query parameter "${key}" must be a string, number, boolean, Date, or an array of those`,
    );
  }
  return String(value);
};

/** Arrays become repeated keys (`?tag=a&tag=b`); `undefined` and `null` are left out */
const serializeQuery = (query: object | undefined): string => {
  if (!query) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item === undefined || item === null) continue;
      search.append(key, serializeQueryValue(key, item));
    }
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
};

const buildHeaders = async (
  defaults: ClientOptions['headers'],
  perRequest: RequestOptions['headers'],
): Promise<Headers> => {
  const headers = new Headers(typeof defaults === 'function' ? await defaults() : defaults);
  for (const [name, value] of Object.entries(perRequest ?? {})) {
    if (value === undefined) headers.delete(name);
    else headers.set(name, value);
  }
  if (!headers.has('accept')) headers.set('accept', DEFAULT_ACCEPT);
  return headers;
};

const readBody = async (response: Response): Promise<unknown> => {
  if (NO_BODY_STATUSES.has(response.status)) return undefined;
  const text = await response.text();
  if (text === '') return undefined;
  if (!JSON_CONTENT_TYPE.test(response.headers.get('content-type') ?? '')) return text;

  try {
    return JSON.parse(text);
  } catch (cause) {
    const parts = { status: response.status, body: text, headers: response.headers };
    throw new UnexpectedResponseError(parts, 'Response body is not valid JSON', { cause });
  }
};

const createCaller = (route: RouteDefinition, path: string, options: ClientOptions): Caller => {
  const schemas = new Map<number, ZodType>(
    resolveRouteResponses(route).map(({ status, schema }) => [status, schema]),
  );
  const sendsBody = BODY_METHODS.has(route.method);
  const baseUrl = options.baseUrl.replace(/\/+$/, '');

  return async (args = {}) => {
    const url =
      baseUrl + interpolatePath(path, args.params, route.method) + serializeQuery(args.query);
    const headers = await buildHeaders(options.headers, args.headers);
    const init: RequestInit = {
      ...options.fetchOptions,
      ...args.fetchOptions,
      method: route.method.toUpperCase(),
      headers,
      signal: args.signal,
    };
    if (sendsBody && args.body !== undefined) {
      init.body = JSON.stringify(args.body);
      headers.set('content-type', 'application/json');
    }

    // Read at call time and call unbound: a fetch called as a method of another object throws
    // "Illegal invocation" in browsers
    const send = options.fetch ?? globalThis.fetch;
    const response = await send(url, init);
    const result = {
      status: response.status,
      body: await readBody(response),
      headers: response.headers,
    };

    const schema = schemas.get(result.status);
    if (!schema) throw new UnexpectedResponseError(result);
    if (!options.validateResponse) return result;

    const parsed = await schema.safeParseAsync(result.body);
    if (!parsed.success) throw new ResponseValidationError(result, parsed.error);
    return { ...result, body: parsed.data };
  };
};

const describeNode = (version: string, group: string[], name?: string) =>
  [version, ...group, ...(name ? [name] : [])].join('/');

/**
 * Creates a typed HTTP client from an API contract. The client mirrors the contract, and each
 * route becomes a function that returns `{ status, body, headers }` typed for every status the
 * route can answer with.
 *
 * @example
 * ```ts
 * import { createClient, unwrap } from '@typeful-api/core/client';
 * import { api } from '@acme/contract';
 *
 * const client = createClient(api, {
 *   baseUrl: 'https://api.example.com',
 *   headers: () => ({ Authorization: `Bearer ${getToken()}` }),
 * });
 *
 * const res = await client.v1.products.get({ params: { id: '42' } });
 * if (res.status === 200) console.log(res.body.name);
 * else if (res.status === 404) console.log(res.body.detail);
 *
 * const products = await client.v1.products.list({ query: { page: 2 } }).then(unwrap);
 * ```
 */
export function createClient<C extends ApiContract>(
  contract: C,
  options: ClientOptions,
): ContractClient<C> {
  const root: ClientNode = {};

  for (const { version, group, name, route, fullPath } of flattenRoutes(contract)) {
    let node = root;
    for (const [index, segment] of [version, ...group].entries()) {
      const existing = node[segment];
      if (typeof existing === 'function') {
        throw new Error(
          `typeful-api client: "${describeNode(version, group.slice(0, index))}" is both a route and a group`,
        );
      }
      node = existing ?? (node[segment] = {});
    }
    if (name in node) {
      throw new Error(
        `typeful-api client: "${describeNode(version, group, name)}" is both a route and a group`,
      );
    }
    node[name] = createCaller(route, fullPath, options);
  }

  return root as unknown as ContractClient<C>;
}
