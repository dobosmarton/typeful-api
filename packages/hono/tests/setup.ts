import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from 'hono';

/**
 * Helper to make HTTP requests to a Hono app for testing
 */
export async function request<E extends Env>(
  app: OpenAPIHono<E>,
  method: string,
  path: string,
  options?: {
    body?: unknown;
    headers?: Record<string, string>;
  },
): Promise<Response> {
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
}

/**
 * Helper to spy on console.warn for testing warning messages
 */
export function spyOnConsoleWarn(): {
  warnings: string[];
  restore: () => void;
} {
  const warnings: string[] = [];
  const originalWarn = console.warn;

  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  };

  return {
    warnings,
    restore: () => {
      console.warn = originalWarn;
    },
  };
}

/**
 * Create a mock Hono context for unit testing middleware
 */
export function createMockContext<V extends Record<string, unknown> = Record<string, unknown>>(
  overrides: {
    path?: string;
    method?: string;
    variables?: V;
  } = {},
) {
  const variables = new Map<string, unknown>(
    Object.entries(overrides.variables ?? {}),
  );

  return {
    req: {
      path: overrides.path ?? '/',
      method: overrides.method ?? 'GET',
      valid: (target: string) => {
        // Mock valid method - returns empty object by default
        return {};
      },
    },
    set: <K extends string>(key: K, value: unknown) => {
      variables.set(key, value);
    },
    get: <K extends string>(key: K) => {
      return variables.get(key);
    },
    var: Object.fromEntries(variables) as V,
    json: <T>(data: T) => {
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  };
}
