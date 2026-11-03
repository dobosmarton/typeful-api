import type { ZodType } from 'zod';
import type { HttpMethod } from '../types';
import { ResponseValidationError, UnexpectedResponseError } from './errors';
import type { ClientOptions, RequestOptions } from './types';

/**
 * What a client function needs to know about a route
 */
export type RouteRequest = {
  method: HttpMethod;
  /** Path template with `:param` (contract) or `{param}` (OpenAPI) segments */
  path: string;
  /** Every status the route declares, with its schema when one is available */
  responses: ReadonlyMap<number, ZodType | undefined>;
};

export type CallArgs = RequestOptions & { params?: object; query?: object; body?: unknown };
export type Caller = (
  args?: CallArgs,
) => Promise<{ status: number; body: unknown; headers: Headers }>;

const BODY_METHODS: ReadonlySet<HttpMethod> = new Set(['post', 'put', 'patch']);
const NO_BODY_STATUSES: ReadonlySet<number> = new Set([204, 205, 304]);
const JSON_CONTENT_TYPE = /^application\/(?:[\w.+-]+\+)?json\s*(?:;|$)/i;
const DEFAULT_ACCEPT = 'application/json, application/problem+json';
const PATH_TEMPLATE_PARAM = /:([A-Za-z_][A-Za-z0-9_]*)|\{([^}/]+)\}/g;

const interpolatePath = (template: string, params: object | undefined, method: string): string =>
  template.replace(PATH_TEMPLATE_PARAM, (_match, colonName?: string, braceName?: string) => {
    const name = (colonName ?? braceName) as string;
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

/**
 * Builds the function that performs one route's requests: interpolates the path, serializes the
 * query, sends JSON, parses the response and checks its status against the declared ones.
 */
export const createCaller = (route: RouteRequest, options: ClientOptions): Caller => {
  const sendsBody = BODY_METHODS.has(route.method);
  const baseUrl = options.baseUrl.replace(/\/+$/, '');

  return async (args = {}) => {
    const url =
      baseUrl + interpolatePath(route.path, args.params, route.method) + serializeQuery(args.query);
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

    if (!route.responses.has(result.status)) throw new UnexpectedResponseError(result);
    const schema = route.responses.get(result.status);
    if (!options.validateResponse || !schema) return result;

    const parsed = await schema.safeParseAsync(result.body);
    if (!parsed.success) throw new ResponseValidationError(result, parsed.error);
    return { ...result, body: parsed.data };
  };
};
