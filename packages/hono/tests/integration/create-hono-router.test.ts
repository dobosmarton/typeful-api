import type { ApiContract } from '@typeful-api/core';
import type { MiddlewareHandler } from 'hono';
import { describe, expect, it } from 'vitest';
import { createHonoRouter } from '../../src/adapter';
import {
  directRoutesContract,
  emptyContract,
  fullContract,
  minimalContract,
  nestedContract,
  pathNormalizationContract,
} from '../fixtures/contracts';
import { HealthSchema } from '../fixtures/schemas';
import { request, spyOnConsoleWarn } from '../setup';

describe('createHonoRouter', () => {
  describe('basic functionality', () => {
    it('creates an OpenAPIHono instance', () => {
      const router = createHonoRouter(minimalContract, {
        v1: {
          health: {
            check: () => ({ status: 'ok' }),
          },
        },
      });

      expect(router).toBeDefined();
      expect(router.fetch).toBeInstanceOf(Function);
    });

    it('handles GET requests', async () => {
      const router = createHonoRouter(minimalContract, {
        v1: {
          health: {
            check: () => ({ status: 'healthy' }),
          },
        },
      });

      const res = await request(router, 'GET', '/v1/health');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: 'healthy' });
    });

    it('mounts routes at /{version}/{group}', async () => {
      const router = createHonoRouter(fullContract, {
        v1: {
          products: {
            list: () => [],
            get: () => ({ id: '123', name: 'Test', price: 10 }),
            create: () => ({ id: '123', name: 'New', price: 20 }),
            update: () => ({ id: '123', name: 'Updated', price: 30 }),
            patch: () => ({ id: '123', name: 'Patched', price: 30 }),
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

      // Test v1/products
      const productsRes = await request(router, 'GET', '/v1/products');
      expect(productsRes.status).toBe(200);

      // Test v1/users
      const usersRes = await request(router, 'GET', '/v1/users');
      expect(usersRes.status).toBe(200);

      // Test v2/products
      const v2Res = await request(router, 'GET', '/v2/products');
      expect(v2Res.status).toBe(200);
    });

    it('handles direct routes on version level', async () => {
      const router = createHonoRouter(directRoutesContract, {
        v1: {
          health: () => ({ status: 'ok' }),
        },
      });

      const res = await request(router, 'GET', '/v1/health');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: 'ok' });
    });
  });

  describe('request body handling', () => {
    it('extracts and validates JSON body for POST', async () => {
      const router = createHonoRouter(fullContract, {
        v1: {
          products: {
            list: () => [],
            get: () => ({ id: '123', name: 'Test', price: 10 }),
            create: ({ body }) => ({
              id: '550e8400-e29b-41d4-a716-446655440000',
              name: body.name,
              price: body.price,
            }),
            update: () => ({ id: '123', name: 'Updated', price: 30 }),
            patch: () => ({ id: '123', name: 'Patched', price: 30 }),
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

      const res = await request(router, 'POST', '/v1/products', {
        body: { name: 'Widget', price: 29.99 },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('Widget');
      expect(body.price).toBe(29.99);
    });

    it('returns 400 for invalid body', async () => {
      const router = createHonoRouter(fullContract, {
        v1: {
          products: {
            list: () => [],
            get: () => ({ id: '123', name: 'Test', price: 10 }),
            create: ({ body }) => ({
              id: '550e8400-e29b-41d4-a716-446655440000',
              ...body,
            }),
            update: () => ({ id: '123', name: 'Updated', price: 30 }),
            patch: () => ({ id: '123', name: 'Patched', price: 30 }),
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

      const res = await request(router, 'POST', '/v1/products', {
        body: { name: '', price: -10 }, // Invalid: empty name, negative price
      });

      expect(res.status).toBe(400);
    });

    it('handles PUT requests with body', async () => {
      const router = createHonoRouter(fullContract, {
        v1: {
          products: {
            list: () => [],
            get: () => ({ id: '123', name: 'Test', price: 10 }),
            create: () => ({ id: '123', name: 'New', price: 20 }),
            update: ({ params, body }) => ({
              id: params.id,
              name: body.name,
              price: body.price,
            }),
            patch: () => ({ id: '123', name: 'Patched', price: 30 }),
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

      const res = await request(
        router,
        'PUT',
        '/v1/products/550e8400-e29b-41d4-a716-446655440000',
        {
          body: { name: 'Updated Widget', price: 39.99 },
        },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('Updated Widget');
    });

    it('handles PATCH requests with partial body', async () => {
      const router = createHonoRouter(fullContract, {
        v1: {
          products: {
            list: () => [],
            get: () => ({ id: '123', name: 'Test', price: 10 }),
            create: () => ({ id: '123', name: 'New', price: 20 }),
            update: () => ({ id: '123', name: 'Updated', price: 30 }),
            patch: ({ params, body }) => ({
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

      const res = await request(
        router,
        'PATCH',
        '/v1/products/550e8400-e29b-41d4-a716-446655440000',
        {
          body: { price: 49.99 }, // Only updating price
        },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.price).toBe(49.99);
    });
  });

  describe('query parameters', () => {
    it('extracts and validates query parameters', async () => {
      const router = createHonoRouter(fullContract, {
        v1: {
          products: {
            list: ({ query }) => {
              return [
                {
                  id: '1',
                  name: `Page ${query.page}, Limit ${query.limit}`,
                  price: 10,
                },
              ];
            },
            get: () => ({ id: '123', name: 'Test', price: 10 }),
            create: () => ({ id: '123', name: 'New', price: 20 }),
            update: () => ({ id: '123', name: 'Updated', price: 30 }),
            patch: () => ({ id: '123', name: 'Patched', price: 30 }),
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

      const res = await request(router, 'GET', '/v1/products?page=2&limit=20');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body[0].name).toBe('Page 2, Limit 20');
    });

    it('applies default values for optional query parameters', async () => {
      const router = createHonoRouter(fullContract, {
        v1: {
          products: {
            list: ({ query }) => {
              return [
                {
                  id: '1',
                  name: `Page ${query.page}, Limit ${query.limit}`,
                  price: 10,
                },
              ];
            },
            get: () => ({ id: '123', name: 'Test', price: 10 }),
            create: () => ({ id: '123', name: 'New', price: 20 }),
            update: () => ({ id: '123', name: 'Updated', price: 30 }),
            patch: () => ({ id: '123', name: 'Patched', price: 30 }),
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

      const res = await request(router, 'GET', '/v1/products');
      expect(res.status).toBe(200);
      const body = await res.json();
      // Defaults: page=1, limit=10
      expect(body[0].name).toBe('Page 1, Limit 10');
    });

    it('returns 400 for invalid query parameters', async () => {
      const router = createHonoRouter(fullContract, {
        v1: {
          products: {
            list: () => [],
            get: () => ({ id: '123', name: 'Test', price: 10 }),
            create: () => ({ id: '123', name: 'New', price: 20 }),
            update: () => ({ id: '123', name: 'Updated', price: 30 }),
            patch: () => ({ id: '123', name: 'Patched', price: 30 }),
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

      // limit > 100 should fail
      const res = await request(router, 'GET', '/v1/products?limit=500');
      expect(res.status).toBe(400);
    });
  });

  describe('path parameters', () => {
    it('extracts and validates path parameters', async () => {
      const router = createHonoRouter(fullContract, {
        v1: {
          products: {
            list: () => [],
            get: ({ params }) => ({
              id: params.id,
              name: 'Found Product',
              price: 10,
            }),
            create: () => ({ id: '123', name: 'New', price: 20 }),
            update: () => ({ id: '123', name: 'Updated', price: 30 }),
            patch: () => ({ id: '123', name: 'Patched', price: 30 }),
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

      const res = await request(router, 'GET', '/v1/products/550e8400-e29b-41d4-a716-446655440000');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('returns 400 for invalid path parameters', async () => {
      const router = createHonoRouter(fullContract, {
        v1: {
          products: {
            list: () => [],
            get: ({ params }) => ({
              id: params.id,
              name: 'Found Product',
              price: 10,
            }),
            create: () => ({ id: '123', name: 'New', price: 20 }),
            update: () => ({ id: '123', name: 'Updated', price: 30 }),
            patch: () => ({ id: '123', name: 'Patched', price: 30 }),
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

      // Invalid UUID format
      const res = await request(router, 'GET', '/v1/products/not-a-uuid');
      expect(res.status).toBe(400);
    });
  });

  describe('middleware', () => {
    it('applies global middleware from options', async () => {
      const logs: string[] = [];

      const loggingMiddleware: MiddlewareHandler = async (c, next) => {
        logs.push(`${c.req.method} ${c.req.path}`);
        await next();
      };

      const router = createHonoRouter(
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

      await request(router, 'GET', '/v1/health');
      expect(logs).toContain('GET /v1/health');
    });

    it('applies version-level middleware', async () => {
      const logs: string[] = [];

      const versionMiddleware: MiddlewareHandler = async (c, next) => {
        logs.push('v1-middleware');
        await next();
      };

      const router = createHonoRouter(minimalContract, {
        v1: {
          middlewares: [versionMiddleware],
          health: {
            check: () => ({ status: 'ok' }),
          },
        },
      });

      await request(router, 'GET', '/v1/health');
      expect(logs).toContain('v1-middleware');
    });

    it('applies group-level middleware', async () => {
      const logs: string[] = [];

      const groupMiddleware: MiddlewareHandler = async (c, next) => {
        logs.push('group-middleware');
        await next();
      };

      const router = createHonoRouter(minimalContract, {
        v1: {
          health: {
            middlewares: [groupMiddleware],
            check: () => ({ status: 'ok' }),
          },
        },
      });

      await request(router, 'GET', '/v1/health');
      expect(logs).toContain('group-middleware');
    });

    it('executes middleware in correct order', async () => {
      const order: string[] = [];

      const globalMiddleware: MiddlewareHandler = async (c, next) => {
        order.push('global');
        await next();
      };

      const versionMiddleware: MiddlewareHandler = async (c, next) => {
        order.push('version');
        await next();
      };

      const groupMiddleware: MiddlewareHandler = async (c, next) => {
        order.push('group');
        await next();
      };

      const router = createHonoRouter(
        minimalContract,
        {
          v1: {
            middlewares: [versionMiddleware],
            health: {
              middlewares: [groupMiddleware],
              check: () => {
                order.push('handler');
                return { status: 'ok' };
              },
            },
          },
        },
        { middleware: [globalMiddleware] },
      );

      await request(router, 'GET', '/v1/health');
      expect(order).toEqual(['global', 'version', 'group', 'handler']);
    });
  });

  describe('edge cases', () => {
    it('handles empty contracts gracefully', async () => {
      const router = createHonoRouter(emptyContract, {
        v1: {},
      });

      expect(router).toBeDefined();
      // Route should not exist
      const res = await request(router, 'GET', '/v1/anything');
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

        createHonoRouter(incompleteContract, {
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
      const router = createHonoRouter(nestedContract, {
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

      const res = await request(router, 'GET', '/v1/api/admin/users');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([{ id: '1', name: 'Admin User' }]);
    });

    it('propagates handler errors correctly', async () => {
      const router = createHonoRouter(minimalContract, {
        v1: {
          health: {
            check: () => {
              throw new Error('Handler error');
            },
          },
        },
      });

      const res = await request(router, 'GET', '/v1/health');
      expect(res.status).toBe(500);
    });

    it('handles path normalization correctly', async () => {
      const router = createHonoRouter(pathNormalizationContract, {
        v1: {
          test: {
            noLeadingSlash: () => ({ status: 'ok' }),
            trailingSlash: () => ({ status: 'ok' }),
            root: () => ({ status: 'ok' }),
          },
        },
      });

      // No leading slash path
      const res1 = await request(router, 'GET', '/v1/test/no-slash');
      expect(res1.status).toBe(200);

      // Trailing slash path (should be stripped)
      const res2 = await request(router, 'GET', '/v1/test/trailing');
      expect(res2.status).toBe(200);

      // Root path
      const res3 = await request(router, 'GET', '/v1/test');
      expect(res3.status).toBe(200);
    });
  });

  describe('options', () => {
    it('applies basePath option', async () => {
      const router = createHonoRouter(
        minimalContract,
        {
          v1: {
            health: {
              check: () => ({ status: 'ok' }),
            },
          },
        },
        { basePath: '/api' },
      );

      const res = await request(router, 'GET', '/api/v1/health');
      expect(res.status).toBe(200);

      // Without basePath should 404
      const resNoBase = await request(router, 'GET', '/v1/health');
      expect(resNoBase.status).toBe(404);
    });

    it('works without basePath option', async () => {
      const router = createHonoRouter(minimalContract, {
        v1: {
          health: {
            check: () => ({ status: 'ok' }),
          },
        },
      });

      const res = await request(router, 'GET', '/v1/health');
      expect(res.status).toBe(200);
    });
  });

  describe('type modes', () => {
    it('works in simple mode (no type parameters)', async () => {
      const router = createHonoRouter(minimalContract, {
        v1: {
          health: {
            check: () => ({ status: 'simple-mode' }),
          },
        },
      });

      const res = await request(router, 'GET', '/v1/health');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: 'simple-mode' });
    });

    it('works with shared variables mode', async () => {
      type SharedVars = { requestId: string };

      const setRequestId: MiddlewareHandler = async (c, next) => {
        c.set('requestId', 'req-123');
        await next();
      };

      const router = createHonoRouter<typeof minimalContract, SharedVars>(minimalContract, {
        v1: {
          middlewares: [setRequestId],
          health: {
            check: ({ c }) => ({
              status: `request: ${c.get('requestId')}`,
            }),
          },
        },
      });

      const res = await request(router, 'GET', '/v1/health');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: 'request: req-123' });
    });
  });

  describe('DELETE requests', () => {
    it('handles DELETE requests correctly', async () => {
      const router = createHonoRouter(fullContract, {
        v1: {
          products: {
            list: () => [],
            get: () => ({ id: '123', name: 'Test', price: 10 }),
            create: () => ({ id: '123', name: 'New', price: 20 }),
            update: () => ({ id: '123', name: 'Updated', price: 30 }),
            patch: () => ({ id: '123', name: 'Patched', price: 30 }),
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

      const res = await request(
        router,
        'DELETE',
        '/v1/products/550e8400-e29b-41d4-a716-446655440000',
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ success: true });
    });
  });

  describe('async handlers', () => {
    it('supports async handlers', async () => {
      const router = createHonoRouter(minimalContract, {
        v1: {
          health: {
            check: async () => {
              await new Promise((r) => setTimeout(r, 10));
              return { status: 'async-ok' };
            },
          },
        },
      });

      const res = await request(router, 'GET', '/v1/health');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: 'async-ok' });
    });

    it('handles async handler errors', async () => {
      const router = createHonoRouter(minimalContract, {
        v1: {
          health: {
            check: async () => {
              await new Promise((r) => setTimeout(r, 10));
              throw new Error('Async error');
            },
          },
        },
      });

      const res = await request(router, 'GET', '/v1/health');
      expect(res.status).toBe(500);
    });
  });

  describe('docs registration', () => {
    it('registers docs route at /api-doc by default', async () => {
      const router = createHonoRouter(minimalContract, {
        v1: {
          health: {
            check: () => ({ status: 'ok' }),
          },
        },
      });

      const res = await request(router, 'GET', '/api-doc');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.openapi).toBe('3.0.0');
      expect(body.info.title).toBe('API Documentation');
      expect(body.info.version).toBe('1.0.0');
    });

    it('includes registered routes in the spec', async () => {
      const router = createHonoRouter(minimalContract, {
        v1: {
          health: {
            check: () => ({ status: 'ok' }),
          },
        },
      });

      const res = await request(router, 'GET', '/api-doc');
      const body = await res.json();
      expect(body.paths).toBeDefined();
      expect(Object.keys(body.paths).length).toBeGreaterThan(0);
    });

    it('uses custom docsPath', async () => {
      const router = createHonoRouter(
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

      const res = await request(router, 'GET', '/docs/api-doc');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.openapi).toBe('3.0.0');

      // Default path should not exist
      const defaultRes = await request(router, 'GET', '/api-doc');
      expect(defaultRes.status).toBe(404);
    });

    it('disables docs route when registerDocs is false', async () => {
      const router = createHonoRouter(
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

      const res = await request(router, 'GET', '/api-doc');
      expect(res.status).toBe(404);
    });

    it('uses custom docsConfig info', async () => {
      const router = createHonoRouter(
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

      const res = await request(router, 'GET', '/api-doc');
      const body = await res.json();
      expect(body.info.title).toBe('My Custom API');
      expect(body.info.version).toBe('2.0.0');
      expect(body.info.description).toBe('Custom description');
    });

    it('respects basePath for docs route', async () => {
      const router = createHonoRouter(
        minimalContract,
        {
          v1: {
            health: {
              check: () => ({ status: 'ok' }),
            },
          },
        },
        { basePath: '/api' },
      );

      const res = await request(router, 'GET', '/api/api-doc');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.openapi).toBe('3.0.0');

      // Without basePath should 404
      const resNoBase = await request(router, 'GET', '/api-doc');
      expect(resNoBase.status).toBe(404);
    });
  });
});
