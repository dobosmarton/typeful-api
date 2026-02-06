import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from 'hono';

/**
 * HTTP methods supported by the test helper
 */
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Options for making test requests
 */
type RequestOptions = {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
};

/**
 * Helper to make HTTP requests to a Hono app for testing
 */
export const request = async <E extends Env>(
  app: OpenAPIHono<E>,
  method: HttpMethod,
  path: string,
  options?: RequestOptions,
): Promise<Response> => {
  const headers: Record<string, string> = { ...options?.headers };

  const init: RequestInit = {
    method: method.toUpperCase(),
    headers,
  };

  if (options?.body !== undefined) {
    init.body = JSON.stringify(options.body);
    headers['Content-Type'] = 'application/json';
  }

  const req = new Request(`http://localhost${path}`, init);
  return app.fetch(req);
};

/**
 * Result of spying on console.warn
 */
type ConsoleWarnSpy = {
  warnings: string[];
  restore: () => void;
};

/**
 * Helper to spy on console.warn for testing warning messages
 */
export const spyOnConsoleWarn = (): ConsoleWarnSpy => {
  const warnings: string[] = [];
  const originalWarn = console.warn;

  console.warn = (...args: unknown[]): void => {
    warnings.push(args.map(String).join(' '));
  };

  return {
    warnings,
    restore: (): void => {
      console.warn = originalWarn;
    },
  };
};

/**
 * Options for creating a mock context
 */
type MockContextOptions<V extends Record<string, unknown>> = {
  path?: string;
  method?: string;
  variables?: V;
};

/**
 * Mock context structure for testing
 */
type MockContext<V extends Record<string, unknown>> = {
  req: {
    path: string;
    method: string;
    valid: (target: string) => Record<string, unknown>;
  };
  set: <K extends string>(key: K, value: unknown) => void;
  get: <K extends string>(key: K) => unknown;
  var: V;
  json: <T>(data: T) => Response;
};

/**
 * Create a mock Hono context for unit testing middleware
 */
export const createMockContext = <V extends Record<string, unknown> = Record<string, unknown>>(
  overrides: MockContextOptions<V> = {},
): MockContext<V> => {
  const variables = new Map<string, unknown>(Object.entries(overrides.variables ?? {}));

  return {
    req: {
      path: overrides.path ?? '/',
      method: overrides.method ?? 'GET',
      valid: (_target: string): Record<string, unknown> => {
        return {};
      },
    },
    set: <K extends string>(key: K, value: unknown): void => {
      variables.set(key, value);
    },
    get: <K extends string>(key: K): unknown => {
      return variables.get(key);
    },
    var: Object.fromEntries(variables) as V,
    json: <T>(data: T): Response => {
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  };
};
