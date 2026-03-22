import type { ApiContract } from '@typeful-api/core';
import type { preHandlerAsyncHookHandler } from 'fastify';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFastifyPlugin } from '../../src/adapter';
import {
  directRoutesContract,
  emptyContract,
  fullContract,
  minimalContract,
  nestedContract,
  pathNormalizationContract,
} from '../fixtures/contracts';
import { HealthSchema } from '../fixtures/schemas';

/** Reusable handler set for fullContract — avoids repeating the same object in every test. */
const fullContractHandlers = (overrides?: {
  products?: Partial<Record<string, unknown>>;
}) => ({
  v1: {
    products: {
      list: ({ query }: { query: { page: number; limit: number } }) => [
        { id: '1', name: `Page ${query.page}, Limit ${query.limit}`, price: 10 },
      ],
      get: ({ params }: { params: { id: string } }) => ({
        id: params.id,
        name: 'Found Product',
        price: 10,
      }),
      create: ({ body }: { body: { name: string; price: number } }) => ({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: body.name,
        price: body.price,
      }),
      update: ({ params, body }: { params: { id: string }; body: { name: string; price: number } }) => ({
        id: params.id,
        name: body.name,
        price: body.price,
      }),
      patch: ({ params, body }: { params: { id: string }; body: { name?: string; price?: number } }) => ({
        id: params.id,
        name: body.name ?? 'Original',
        price: body.price ?? 10,
      }),
      delete: () => ({ success: true }),
      ...overrides?.products,
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

describe('createFastifyPlugin', () => {
  let fastify: FastifyInstance;

  afterEach(async () => {
    if (fastify) {
      await fastify.close();
    }
  });

  describe('basic functionality', () => {
    it('creates a plugin and registers it', async () => {
      const plugin = createFastifyPlugin(minimalContract, {
        v1: {
          health: {
            check: () => ({ status: 'ok' }),
          },
        },
      });

      expect(plugin).toBeDefined();
      expect(typeof plugin).toBe('function');

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();
    });

    it('handles GET requests', async () => {
      const plugin = createFastifyPlugin(minimalContract, {
        v1: {
          health: {
            check: () => ({ status: 'healthy' }),
          },
        },
      });

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      const res = await fastify.inject({
        method: 'GET',
        url: '/v1/health',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'healthy' });
    });

    it('mounts routes at /{version}/{group}', async () => {
      const plugin = createFastifyPlugin(fullContract, fullContractHandlers());

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      // Test v1/products
      const productsRes = await fastify.inject({
        method: 'GET',
        url: '/v1/products',
      });
      expect(productsRes.statusCode).toBe(200);

      // Test v1/users
      const usersRes = await fastify.inject({
        method: 'GET',
        url: '/v1/users',
      });
      expect(usersRes.statusCode).toBe(200);

      // Test v2/products
      const v2Res = await fastify.inject({
        method: 'GET',
        url: '/v2/products',
      });
      expect(v2Res.statusCode).toBe(200);
    });

    it('handles direct routes on version level', async () => {
      const plugin = createFastifyPlugin(directRoutesContract, {
        v1: {
          health: () => ({ status: 'ok' }),
        },
      });

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      const res = await fastify.inject({
        method: 'GET',
        url: '/v1/health',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ok' });
    });
  });

  describe('request body handling', () => {
    it('extracts and validates JSON body for POST', async () => {
      const plugin = createFastifyPlugin(fullContract, fullContractHandlers());

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      const res = await fastify.inject({
        method: 'POST',
        url: '/v1/products',
        payload: { name: 'Widget', price: 29.99 },
        headers: { 'content-type': 'application/json' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.name).toBe('Widget');
      expect(body.price).toBe(29.99);
    });

    it('returns 422 for invalid body', async () => {
      const plugin = createFastifyPlugin(fullContract, fullContractHandlers());

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      const res = await fastify.inject({
        method: 'POST',
        url: '/v1/products',
        payload: { name: '', price: -10 }, // Invalid: empty name, negative price
        headers: { 'content-type': 'application/json' },
      });

      expect(res.statusCode).toBe(422);
    });

    it('handles PUT requests with body', async () => {
      const plugin = createFastifyPlugin(fullContract, fullContractHandlers());

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      const res = await fastify.inject({
        method: 'PUT',
        url: '/v1/products/550e8400-e29b-41d4-a716-446655440000',
        payload: { name: 'Updated Widget', price: 39.99 },
        headers: { 'content-type': 'application/json' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.name).toBe('Updated Widget');
    });

    it('handles PATCH requests with partial body', async () => {
      const plugin = createFastifyPlugin(fullContract, fullContractHandlers());

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      const res = await fastify.inject({
        method: 'PATCH',
        url: '/v1/products/550e8400-e29b-41d4-a716-446655440000',
        payload: { price: 49.99 }, // Only updating price
        headers: { 'content-type': 'application/json' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.price).toBe(49.99);
    });
  });

  describe('query parameters', () => {
    it('extracts and validates query parameters', async () => {
      const plugin = createFastifyPlugin(fullContract, fullContractHandlers());

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      const res = await fastify.inject({
        method: 'GET',
        url: '/v1/products?page=2&limit=20',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body[0].name).toBe('Page 2, Limit 20');
    });

    it('applies default values for optional query parameters', async () => {
      const plugin = createFastifyPlugin(fullContract, fullContractHandlers());

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      const res = await fastify.inject({
        method: 'GET',
        url: '/v1/products',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // Defaults: page=1, limit=10
      expect(body[0].name).toBe('Page 1, Limit 10');
    });

    it('returns 422 for invalid query parameters', async () => {
      const plugin = createFastifyPlugin(fullContract, fullContractHandlers());

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      // limit > 100 should fail
      const res = await fastify.inject({
        method: 'GET',
        url: '/v1/products?limit=500',
      });

      expect(res.statusCode).toBe(422);
    });
  });

  describe('path parameters', () => {
    it('extracts and validates path parameters', async () => {
      const plugin = createFastifyPlugin(fullContract, fullContractHandlers());

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      const res = await fastify.inject({
        method: 'GET',
        url: '/v1/products/550e8400-e29b-41d4-a716-446655440000',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('returns 422 for invalid path parameters', async () => {
      const plugin = createFastifyPlugin(fullContract, fullContractHandlers());

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      // Invalid UUID format
      const res = await fastify.inject({
        method: 'GET',
        url: '/v1/products/not-a-uuid',
      });

      expect(res.statusCode).toBe(422);
    });
  });

  describe('preHandler hooks', () => {
    it('applies global preHandler from options', async () => {
      const logs: string[] = [];

      const loggingPreHandler: preHandlerAsyncHookHandler = async (request, _reply) => {
        logs.push(`${request.method} ${request.url}`);
      };

      const plugin = createFastifyPlugin(
        minimalContract,
        {
          v1: {
            health: {
              check: () => ({ status: 'ok' }),
            },
          },
        },
        { preHandler: [loggingPreHandler] },
      );

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      await fastify.inject({
        method: 'GET',
        url: '/v1/health',
      });

      expect(logs).toContain('GET /v1/health');
    });

    it('applies version-level preHandler', async () => {
      const logs: string[] = [];

      const versionPreHandler: preHandlerAsyncHookHandler = async (_request, _reply) => {
        logs.push('v1-preHandler');
      };

      const plugin = createFastifyPlugin(minimalContract, {
        v1: {
          preHandler: [versionPreHandler],
          health: {
            check: () => ({ status: 'ok' }),
          },
        },
      });

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      await fastify.inject({
        method: 'GET',
        url: '/v1/health',
      });

      expect(logs).toContain('v1-preHandler');
    });

    it('applies group-level preHandler', async () => {
      const logs: string[] = [];

      const groupPreHandler: preHandlerAsyncHookHandler = async (_request, _reply) => {
        logs.push('group-preHandler');
      };

      const plugin = createFastifyPlugin(minimalContract, {
        v1: {
          health: {
            preHandler: [groupPreHandler],
            check: () => ({ status: 'ok' }),
          },
        },
      });

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      await fastify.inject({
        method: 'GET',
        url: '/v1/health',
      });

      expect(logs).toContain('group-preHandler');
    });

    it('executes preHandlers in correct order (global -> version -> group -> handler)', async () => {
      const order: string[] = [];

      const globalPreHandler: preHandlerAsyncHookHandler = async (_request, _reply) => {
        order.push('global');
      };

      const versionPreHandler: preHandlerAsyncHookHandler = async (_request, _reply) => {
        order.push('version');
      };

      const groupPreHandler: preHandlerAsyncHookHandler = async (_request, _reply) => {
        order.push('group');
      };

      const plugin = createFastifyPlugin(
        minimalContract,
        {
          v1: {
            preHandler: [versionPreHandler],
            health: {
              preHandler: [groupPreHandler],
              check: () => {
                order.push('handler');
                return { status: 'ok' };
              },
            },
          },
        },
        { preHandler: [globalPreHandler] },
      );

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      await fastify.inject({
        method: 'GET',
        url: '/v1/health',
      });

      expect(order).toEqual(['global', 'version', 'group', 'handler']);
    });
  });

  describe('edge cases', () => {
    it('handles empty contracts gracefully', async () => {
      const plugin = createFastifyPlugin(emptyContract, {
        v1: {},
      });

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      const res = await fastify.inject({
        method: 'GET',
        url: '/v1/anything',
      });

      expect(res.statusCode).toBe(404);
    });

    it('warns when handler is missing for a route', async () => {
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

      fastify = Fastify();
      const warnSpy = vi.spyOn(fastify.log, 'warn');

      const plugin = createFastifyPlugin(incompleteContract, {
        v1: {
          // @ts-expect-error - missing handler for 'missing' route
          test: {
            // missing handler for 'missing' route
          },
        },
      });

      fastify.register(plugin);
      await fastify.ready();

      expect(warnSpy).toHaveBeenCalled();
      const warnCall = warnSpy.mock.calls[0]?.[0];
      expect(String(warnCall)).toContain('Missing handler');
    });

    it('handles nested groups correctly', async () => {
      const plugin = createFastifyPlugin(nestedContract, {
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

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      const res = await fastify.inject({
        method: 'GET',
        url: '/v1/api/admin/users',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([{ id: '1', name: 'Admin User' }]);
    });

    it('propagates handler errors correctly', async () => {
      const plugin = createFastifyPlugin(minimalContract, {
        v1: {
          health: {
            check: () => {
              throw new Error('Handler error');
            },
          },
        },
      });

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      const res = await fastify.inject({
        method: 'GET',
        url: '/v1/health',
      });

      expect(res.statusCode).toBe(500);
    });

    it('handles path normalization correctly', async () => {
      const plugin = createFastifyPlugin(pathNormalizationContract, {
        v1: {
          test: {
            noLeadingSlash: () => ({ status: 'ok' }),
            trailingSlash: () => ({ status: 'ok' }),
            root: () => ({ status: 'ok' }),
          },
        },
      });

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      // No leading slash path
      const res1 = await fastify.inject({
        method: 'GET',
        url: '/v1/test/no-slash',
      });
      expect(res1.statusCode).toBe(200);

      // Trailing slash path (should be stripped)
      const res2 = await fastify.inject({
        method: 'GET',
        url: '/v1/test/trailing',
      });
      expect(res2.statusCode).toBe(200);

      // Root path
      const res3 = await fastify.inject({
        method: 'GET',
        url: '/v1/test',
      });
      expect(res3.statusCode).toBe(200);
    });
  });

  describe('options', () => {
    it('registers docs route at /api-doc by default', async () => {
      const plugin = createFastifyPlugin(minimalContract, {
        v1: {
          health: {
            check: () => ({ status: 'ok' }),
          },
        },
      });

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      const res = await fastify.inject({
        method: 'GET',
        url: '/api-doc',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.openapi).toBe('3.0.0');
      expect(body.info.title).toBe('API Documentation');
      expect(body.info.version).toBe('1.0.0');
    });

    it('uses custom docsPath', async () => {
      const plugin = createFastifyPlugin(
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

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      const res = await fastify.inject({
        method: 'GET',
        url: '/docs/api-doc',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.openapi).toBe('3.0.0');

      // Default path should not exist
      const defaultRes = await fastify.inject({
        method: 'GET',
        url: '/api-doc',
      });
      expect(defaultRes.statusCode).toBe(404);
    });

    it('disables docs route when registerDocs is false', async () => {
      const plugin = createFastifyPlugin(
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

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      const res = await fastify.inject({
        method: 'GET',
        url: '/api-doc',
      });

      expect(res.statusCode).toBe(404);
    });

    it('uses custom docsConfig info', async () => {
      const plugin = createFastifyPlugin(
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

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      const res = await fastify.inject({
        method: 'GET',
        url: '/api-doc',
      });

      const body = res.json();
      expect(body.info.title).toBe('My Custom API');
      expect(body.info.version).toBe('2.0.0');
      expect(body.info.description).toBe('Custom description');
    });

    it('applies custom errorHandler', async () => {
      const plugin = createFastifyPlugin(
        minimalContract,
        {
          v1: {
            health: {
              check: () => {
                throw new Error('Test error');
              },
            },
          },
        },
        {
          errorHandler: (error, _request, reply) => {
            reply.status(503).send({
              customError: true,
              message: error.message,
            });
          },
        },
      );

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      const res = await fastify.inject({
        method: 'GET',
        url: '/v1/health',
      });

      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body.customError).toBe(true);
      expect(body.message).toBe('Test error');
    });
  });

  describe('async handlers', () => {
    it('supports async handlers', async () => {
      const plugin = createFastifyPlugin(minimalContract, {
        v1: {
          health: {
            check: async () => {
              await new Promise((r) => setTimeout(r, 10));
              return { status: 'async-ok' };
            },
          },
        },
      });

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      const res = await fastify.inject({
        method: 'GET',
        url: '/v1/health',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'async-ok' });
    });

    it('handles async handler errors', async () => {
      const plugin = createFastifyPlugin(minimalContract, {
        v1: {
          health: {
            check: async () => {
              await new Promise((r) => setTimeout(r, 10));
              throw new Error('Async error');
            },
          },
        },
      });

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      const res = await fastify.inject({
        method: 'GET',
        url: '/v1/health',
      });

      expect(res.statusCode).toBe(500);
    });
  });

  describe('DELETE requests', () => {
    it('handles DELETE requests correctly', async () => {
      const plugin = createFastifyPlugin(fullContract, fullContractHandlers());

      fastify = Fastify();
      fastify.register(plugin);
      await fastify.ready();

      const res = await fastify.inject({
        method: 'DELETE',
        url: '/v1/products/550e8400-e29b-41d4-a716-446655440000',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true });
    });
  });
});
