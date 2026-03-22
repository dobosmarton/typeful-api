import type { ApiContract } from '@typeful-api/core';
import type { RequestHandler } from 'express';
import express from 'express';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { createExpressRouter } from '../../src/adapter';
import {
  directRoutesContract,
  emptyContract,
  fullContract,
  minimalContract,
  nestedContract,
  pathNormalizationContract,
} from '../fixtures/contracts';
import { HealthSchema } from '../fixtures/schemas';

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
 * Create an Express app with JSON middleware and the given router mounted
 */
const createTestApp = (router: express.Router) => {
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
};

/**
 * Helper to make HTTP requests to an Express app for testing
 */
const request = async (
  app: express.Express,
  method: HttpMethod,
  path: string,
  options?: RequestOptions,
): Promise<Response> => {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;

  const headers: Record<string, string> = { ...options?.headers };
  const init: RequestInit = { method };
  if (options?.body) {
    init.body = JSON.stringify(options.body);
    headers['Content-Type'] = 'application/json';
  }
  init.headers = headers;

  const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
  server.close();
  return res;
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
const spyOnConsoleWarn = (): ConsoleWarnSpy => {
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

/** Reusable handler set for fullContract — avoids repeating the same object in every test. */
const fullContractHandlers = () => ({
  v1: {
    products: {
      list: ({ query }: { query: { page: number; limit: number } }) => {
        return [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: `Page ${query.page}, Limit ${query.limit}`,
            price: 10,
          },
        ];
      },
      get: ({ params }: { params: { id: string } }) => ({
        id: params.id,
        name: 'Test',
        price: 10,
      }),
      create: ({ body }: { body: { name: string; price: number } }) => ({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: body.name,
        price: body.price,
      }),
      update: ({
        params,
        body,
      }: {
        params: { id: string };
        body: { name: string; price: number };
      }) => ({
        id: params.id,
        name: body.name,
        price: body.price,
      }),
      patch: ({
        params,
        body,
      }: {
        params: { id: string };
        body: { name?: string; price?: number };
      }) => ({
        id: params.id,
        name: body.name ?? 'Original',
        price: body.price ?? 10,
      }),
      delete: () => ({ success: true }),
    },
    users: {
      list: () => [],
      get: () => ({ id: '1', name: 'User' }),
    },
  },
  v2: {
    products: {
      list: () => [],
    },
  },
});

describe('createExpressRouter', () => {
  describe('basic functionality', () => {
    it('creates a Router instance', () => {
      const router = createExpressRouter(minimalContract, {
        v1: {
          health: {
            check: () => ({ status: 'ok' }),
          },
        },
      });

      expect(router).toBeDefined();
      // Express Router is a function
      expect(typeof router).toBe('function');
    });

    it('handles GET requests', async () => {
      const router = createExpressRouter(minimalContract, {
        v1: {
          health: {
            check: () => ({ status: 'healthy' }),
          },
        },
      });

      const app = createTestApp(router);
      const res = await request(app, 'GET', '/v1/health');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: 'healthy' });
    });

    it('mounts routes at /{version}/{group}', async () => {
      const router = createExpressRouter(fullContract, fullContractHandlers());
      const app = createTestApp(router);

      // Test v1/products
      const productsRes = await request(app, 'GET', '/v1/products');
      expect(productsRes.status).toBe(200);

      // Test v1/users
      const usersRes = await request(app, 'GET', '/v1/users');
      expect(usersRes.status).toBe(200);

      // Test v2/products
      const v2Res = await request(app, 'GET', '/v2/products');
      expect(v2Res.status).toBe(200);
    });

    it('handles direct routes on version level', async () => {
      const router = createExpressRouter(directRoutesContract, {
        v1: {
          health: () => ({ status: 'ok' }),
        },
      });

      const app = createTestApp(router);
      const res = await request(app, 'GET', '/v1/health');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: 'ok' });
    });
  });

  describe('request body handling', () => {
    it('extracts and validates JSON body for POST', async () => {
      const router = createExpressRouter(fullContract, fullContractHandlers());
      const app = createTestApp(router);

      const res = await request(app, 'POST', '/v1/products', {
        body: { name: 'Widget', price: 29.99 },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('Widget');
      expect(body.price).toBe(29.99);
    });

    it('returns 422 for invalid body', async () => {
      const router = createExpressRouter(fullContract, fullContractHandlers());
      const app = createTestApp(router);

      const res = await request(app, 'POST', '/v1/products', {
        body: { name: '', price: -10 }, // Invalid: empty name, negative price
      });

      expect(res.status).toBe(422);
    });

    it('handles PUT requests with body', async () => {
      const router = createExpressRouter(fullContract, fullContractHandlers());
      const app = createTestApp(router);

      const res = await request(app, 'PUT', '/v1/products/550e8400-e29b-41d4-a716-446655440000', {
        body: { name: 'Updated Widget', price: 39.99 },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('Updated Widget');
    });

    it('handles PATCH requests with partial body', async () => {
      const router = createExpressRouter(fullContract, fullContractHandlers());
      const app = createTestApp(router);

      const res = await request(app, 'PATCH', '/v1/products/550e8400-e29b-41d4-a716-446655440000', {
        body: { price: 49.99 }, // Only updating price
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.price).toBe(49.99);
    });
  });

  describe('query parameters', () => {
    it('extracts and validates query parameters', async () => {
      const router = createExpressRouter(fullContract, fullContractHandlers());
      const app = createTestApp(router);

      const res = await request(app, 'GET', '/v1/products?page=2&limit=20');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body[0].name).toBe('Page 2, Limit 20');
    });

    it('applies default values for optional query parameters', async () => {
      const router = createExpressRouter(fullContract, fullContractHandlers());
      const app = createTestApp(router);

      const res = await request(app, 'GET', '/v1/products');
      expect(res.status).toBe(200);
      const body = await res.json();
      // Defaults: page=1, limit=10
      expect(body[0].name).toBe('Page 1, Limit 10');
    });

    it('returns 422 for invalid query parameters', async () => {
      const router = createExpressRouter(fullContract, fullContractHandlers());
      const app = createTestApp(router);

      // limit > 100 should fail
      const res = await request(app, 'GET', '/v1/products?limit=500');
      expect(res.status).toBe(422);
    });
  });

  describe('path parameters', () => {
    it('extracts and validates path parameters', async () => {
      const router = createExpressRouter(fullContract, fullContractHandlers());
      const app = createTestApp(router);

      const res = await request(app, 'GET', '/v1/products/550e8400-e29b-41d4-a716-446655440000');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('returns 422 for invalid path parameters', async () => {
      const router = createExpressRouter(fullContract, fullContractHandlers());
      const app = createTestApp(router);

      // Invalid UUID format
      const res = await request(app, 'GET', '/v1/products/not-a-uuid');
      expect(res.status).toBe(422);
    });
  });

  describe('middleware', () => {
    it('applies global middleware from options', async () => {
      const logs: string[] = [];

      const loggingMiddleware: RequestHandler = (req, _res, next) => {
        logs.push(`${req.method} ${req.path}`);
        next();
      };

      const router = createExpressRouter(
        minimalContract,
        {
          v1: {
            health: {
              check: () => ({ status: 'ok' }),
            },
          },
        },
        { middleware: [loggingMiddleware] },
      );

      const app = createTestApp(router);
      await request(app, 'GET', '/v1/health');
      expect(logs.some((l) => l.includes('GET') && l.includes('/health'))).toBe(true);
    });

    it('applies version-level middleware', async () => {
      const logs: string[] = [];

      const versionMiddleware: RequestHandler = (_req, _res, next) => {
        logs.push('v1-middleware');
        next();
      };

      const router = createExpressRouter(minimalContract, {
        v1: {
          middleware: [versionMiddleware],
          health: {
            check: () => ({ status: 'ok' }),
          },
        },
      });

      const app = createTestApp(router);
      await request(app, 'GET', '/v1/health');
      expect(logs).toContain('v1-middleware');
    });

    it('applies group-level middleware', async () => {
      const logs: string[] = [];

      const groupMiddleware: RequestHandler = (_req, _res, next) => {
        logs.push('group-middleware');
        next();
      };

      const router = createExpressRouter(minimalContract, {
        v1: {
          health: {
            middleware: [groupMiddleware],
            check: () => ({ status: 'ok' }),
          },
        },
      });

      const app = createTestApp(router);
      await request(app, 'GET', '/v1/health');
      expect(logs).toContain('group-middleware');
    });

    it('executes middleware in correct order', async () => {
      const order: string[] = [];

      const globalMiddleware: RequestHandler = (_req, _res, next) => {
        order.push('global');
        next();
      };

      const versionMiddleware: RequestHandler = (_req, _res, next) => {
        order.push('version');
        next();
      };

      const groupMiddleware: RequestHandler = (_req, _res, next) => {
        order.push('group');
        next();
      };

      const router = createExpressRouter(
        minimalContract,
        {
          v1: {
            middleware: [versionMiddleware],
            health: {
              middleware: [groupMiddleware],
              check: () => {
                order.push('handler');
                return { status: 'ok' };
              },
            },
          },
        },
        { middleware: [globalMiddleware] },
      );

      const app = createTestApp(router);
      await request(app, 'GET', '/v1/health');
      expect(order).toEqual(['global', 'version', 'group', 'handler']);
    });
  });

  describe('edge cases', () => {
    it('handles empty contracts gracefully', async () => {
      const router = createExpressRouter(emptyContract, {
        v1: {},
      });

      const app = createTestApp(router);
      expect(router).toBeDefined();
      // Route should not exist
      const res = await request(app, 'GET', '/v1/anything');
      expect(res.status).toBe(404);
    });

    it('warns when handler is missing for a route', async () => {
      const spy = spyOnConsoleWarn();

      try {
        const incompleteContract = {
          v1: {
            children: {
              test: {
                routes: {
                  missing: {
                    method: 'get' as const,
                    path: '/',
                    response: HealthSchema,
                  },
                },
              },
            },
          },
        } satisfies ApiContract;

        createExpressRouter(incompleteContract, {
          v1: {
            // @ts-expect-error - missing handler for 'missing' route
            test: {
              // missing handler for 'missing' route
            },
          },
        });

        expect(spy.warnings.some((w) => w.includes('Missing handler'))).toBe(true);
      } finally {
        spy.restore();
      }
    });

    it('handles nested groups correctly', async () => {
      const router = createExpressRouter(nestedContract, {
        v1: {
          api: {
            admin: {
              users: {
                list: () => [{ id: '1', name: 'Admin User' }],
              },
            },
          },
        },
      });

      const app = createTestApp(router);
      const res = await request(app, 'GET', '/v1/api/admin/users');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([{ id: '1', name: 'Admin User' }]);
    });

    it('propagates handler errors correctly', async () => {
      const router = createExpressRouter(minimalContract, {
        v1: {
          health: {
            check: () => {
              throw new Error('Handler error');
            },
          },
        },
      });

      const app = createTestApp(router);
      // Add Express error handler to return 500
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      app.use(((
        err: Error,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        res.status(500).json({ error: err.message });
      }) as express.ErrorRequestHandler);

      const res = await request(app, 'GET', '/v1/health');
      expect(res.status).toBe(500);
    });

    it('handles path normalization correctly', async () => {
      const router = createExpressRouter(pathNormalizationContract, {
        v1: {
          test: {
            noLeadingSlash: () => ({ status: 'ok' }),
            trailingSlash: () => ({ status: 'ok' }),
            root: () => ({ status: 'ok' }),
          },
        },
      });

      const app = createTestApp(router);

      // No leading slash path
      const res1 = await request(app, 'GET', '/v1/test/no-slash');
      expect(res1.status).toBe(200);

      // Trailing slash path (should be stripped)
      const res2 = await request(app, 'GET', '/v1/test/trailing');
      expect(res2.status).toBe(200);

      // Root path
      const res3 = await request(app, 'GET', '/v1/test');
      expect(res3.status).toBe(200);
    });
  });

  describe('options', () => {
    it('registers docs route at /api-doc by default', async () => {
      const router = createExpressRouter(minimalContract, {
        v1: {
          health: {
            check: () => ({ status: 'ok' }),
          },
        },
      });

      const app = createTestApp(router);
      const res = await request(app, 'GET', '/api-doc');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.openapi).toBe('3.0.0');
      expect(body.info.title).toBe('API Documentation');
      expect(body.info.version).toBe('1.0.0');
    });

    it('uses custom docsPath', async () => {
      const router = createExpressRouter(
        minimalContract,
        {
          v1: {
            health: {
              check: () => ({ status: 'ok' }),
            },
          },
        },
        { docsPath: '/docs/api-doc' },
      );

      const app = createTestApp(router);
      const res = await request(app, 'GET', '/docs/api-doc');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.openapi).toBe('3.0.0');

      // Default path should not exist
      const defaultRes = await request(app, 'GET', '/api-doc');
      expect(defaultRes.status).toBe(404);
    });

    it('disables docs route when registerDocs is false', async () => {
      const router = createExpressRouter(
        minimalContract,
        {
          v1: {
            health: {
              check: () => ({ status: 'ok' }),
            },
          },
        },
        { registerDocs: false },
      );

      const app = createTestApp(router);
      const res = await request(app, 'GET', '/api-doc');
      expect(res.status).toBe(404);
    });

    it('uses custom docsConfig info', async () => {
      const router = createExpressRouter(
        minimalContract,
        {
          v1: {
            health: {
              check: () => ({ status: 'ok' }),
            },
          },
        },
        {
          docsConfig: {
            info: {
              title: 'My Custom API',
              version: '2.0.0',
              description: 'Custom description',
            },
          },
        },
      );

      const app = createTestApp(router);
      const res = await request(app, 'GET', '/api-doc');
      const body = await res.json();
      expect(body.info.title).toBe('My Custom API');
      expect(body.info.version).toBe('2.0.0');
      expect(body.info.description).toBe('Custom description');
    });
  });

  describe('async handlers', () => {
    it('supports async handlers', async () => {
      const router = createExpressRouter(minimalContract, {
        v1: {
          health: {
            check: async () => {
              await new Promise((r) => setTimeout(r, 10));
              return { status: 'async-ok' };
            },
          },
        },
      });

      const app = createTestApp(router);
      const res = await request(app, 'GET', '/v1/health');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: 'async-ok' });
    });

    it('handles async handler errors', async () => {
      const router = createExpressRouter(minimalContract, {
        v1: {
          health: {
            check: async () => {
              await new Promise((r) => setTimeout(r, 10));
              throw new Error('Async error');
            },
          },
        },
      });

      const app = createTestApp(router);
      // Add Express error handler to return 500
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      app.use(((
        err: Error,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        res.status(500).json({ error: err.message });
      }) as express.ErrorRequestHandler);

      const res = await request(app, 'GET', '/v1/health');
      expect(res.status).toBe(500);
    });
  });

  describe('DELETE requests', () => {
    it('handles DELETE requests correctly', async () => {
      const router = createExpressRouter(fullContract, fullContractHandlers());
      const app = createTestApp(router);

      const res = await request(app, 'DELETE', '/v1/products/550e8400-e29b-41d4-a716-446655440000');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ success: true });
    });
  });
});
