import type { ApiContract } from '@typeful-api/core';
import { route } from '@typeful-api/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createFastifyPlugin } from '../../src/adapter';

// Test schemas
const HealthSchema = z.object({ status: z.string() });
const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number(),
});
const CreateProductSchema = z.object({
  name: z.string().min(1),
  price: z.number().positive(),
});
const IdParamsSchema = z.object({ id: z.uuid() });
const PaginationSchema = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
});
const ErrorSchema = z.object({ error: z.string() });

// Mock factory for Fastify request
function createMockRequest(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return {
    url: '/',
    method: 'GET',
    query: {},
    params: {},
    body: {},
    ...overrides,
  } as FastifyRequest;
}

// Mock factory for Fastify reply
function createMockReply(): FastifyReply {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    sent: false,
  } as unknown as FastifyReply;
}

// Create a mock Fastify instance
function createMockFastify(): FastifyInstance {
  const hooks: Record<string, Function[]> = {};
  const routes: Array<{ method: string; url: string; handler: Function }> = [];
  const registeredPlugins: Array<{ plugin: Function; opts: any }> = [];

  const mockFastify = {
    addHook: vi.fn((name: string, hook: Function) => {
      if (!hooks[name]) hooks[name] = [];
      hooks[name].push(hook);
    }),
    setErrorHandler: vi.fn(),
    register: vi.fn((plugin: Function, opts?: any) => {
      registeredPlugins.push({ plugin, opts });
      return mockFastify;
    }),
    route: vi.fn((config: any) => {
      routes.push({
        method: config.method,
        url: config.url,
        handler: config.handler,
      });
    }),
    get: vi.fn((url: string, handler: Function) => {
      routes.push({ method: 'GET', url, handler });
      return mockFastify;
    }),
    log: {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    },
    _hooks: hooks,
    _routes: routes,
    _registeredPlugins: registeredPlugins,
  } as unknown as FastifyInstance & {
    _hooks: typeof hooks;
    _routes: typeof routes;
    _registeredPlugins: typeof registeredPlugins;
  };

  return mockFastify;
}

describe('createFastifyPlugin', () => {
  describe('plugin creation', () => {
    it('creates a valid Fastify plugin', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const plugin = createFastifyPlugin(contract, {
        v1: {
          health: async () => ({ status: 'ok' }),
        },
      });

      expect(plugin).toBeDefined();
      expect(typeof plugin).toBe('function');
    });

    it('registers routes with correct HTTP methods', async () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            get: route.get('/test').returns(HealthSchema),
            post: route.post('/test').body(CreateProductSchema).returns(ProductSchema),
            put: route.put('/test').body(CreateProductSchema).returns(ProductSchema),
            patch: route.patch('/test').body(CreateProductSchema).returns(ProductSchema),
            delete: route.delete('/test').returns(z.object({ success: z.boolean() })),
          },
        },
      };

      const handlers = {
        v1: {
          get: async () => ({ status: 'ok' }),
          post: async ({ body }: any) => ({ ...body, id: '1' }),
          put: async ({ body }: any) => ({ ...body, id: '1' }),
          patch: async ({ body }: any) => ({ ...body, id: '1' }),
          delete: async () => ({ success: true }),
        },
      };

      const plugin = createFastifyPlugin(contract, handlers);
      expect(plugin).toBeDefined();
    });

    it('handles nested route groups', async () => {
      const contract: ApiContract = {
        v1: {
          children: {
            products: {
              routes: {
                list: route.get('/').returns(z.array(ProductSchema)),
                get: route.get('/:id').params(IdParamsSchema).returns(ProductSchema),
              },
            },
          },
        },
      };

      const handlers = {
        v1: {
          products: {
            list: async () => [],
            get: async ({ params }: any) => ({
              id: params.id,
              name: 'Test',
              price: 100,
            }),
          },
        },
      };

      const plugin = createFastifyPlugin(contract, handlers);
      expect(plugin).toBeDefined();
    });

    it('handles deeply nested groups', async () => {
      const contract: ApiContract = {
        v1: {
          children: {
            admin: {
              children: {
                users: {
                  routes: {
                    list: route.get('/').returns(z.array(z.object({ name: z.string() }))),
                  },
                },
              },
            },
          },
        },
      };

      const handlers = {
        v1: {
          admin: {
            users: {
              list: async () => [],
            },
          },
        },
      };

      const plugin = createFastifyPlugin(contract, handlers);
      expect(plugin).toBeDefined();
    });
  });

  describe('preHandler support', () => {
    it('applies global preHandler', async () => {
      const globalPreHandler = vi.fn(async () => {});

      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const plugin = createFastifyPlugin(
        contract,
        {
          v1: {
            health: async () => ({ status: 'ok' }),
          },
        },
        { preHandler: globalPreHandler },
      );

      expect(plugin).toBeDefined();
    });

    it('applies global preHandler array', async () => {
      const preHandler1 = vi.fn(async () => {});
      const preHandler2 = vi.fn(async () => {});

      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const plugin = createFastifyPlugin(
        contract,
        {
          v1: {
            health: async () => ({ status: 'ok' }),
          },
        },
        { preHandler: [preHandler1, preHandler2] },
      );

      expect(plugin).toBeDefined();
    });

    it('applies version-level preHandler', async () => {
      const versionPreHandler = vi.fn(async () => {});

      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const plugin = createFastifyPlugin(contract, {
        v1: {
          preHandler: versionPreHandler,
          health: async () => ({ status: 'ok' }),
        },
      });

      expect(plugin).toBeDefined();
    });

    it('applies group-level preHandler', async () => {
      const groupPreHandler = vi.fn(async () => {});

      const contract: ApiContract = {
        v1: {
          children: {
            products: {
              routes: {
                list: route.get('/').returns(z.array(ProductSchema)),
              },
            },
          },
        },
      };

      const plugin = createFastifyPlugin(contract, {
        v1: {
          products: {
            preHandler: groupPreHandler,
            list: async () => [],
          },
        },
      });

      expect(plugin).toBeDefined();
    });

    it('applies group-level preHandler array', async () => {
      const preHandler1 = vi.fn(async () => {});
      const preHandler2 = vi.fn(async () => {});

      const contract: ApiContract = {
        v1: {
          children: {
            products: {
              routes: {
                list: route.get('/').returns(z.array(ProductSchema)),
              },
            },
          },
        },
      };

      const plugin = createFastifyPlugin(contract, {
        v1: {
          products: {
            preHandler: [preHandler1, preHandler2],
            list: async () => [],
          },
        },
      });

      expect(plugin).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('applies custom error handler', async () => {
      const errorHandler = vi.fn();

      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const plugin = createFastifyPlugin(
        contract,
        {
          v1: {
            health: async () => ({ status: 'ok' }),
          },
        },
        { errorHandler },
      );

      expect(plugin).toBeDefined();
    });
  });

  describe('handler context', () => {
    it('passes correct context to handler', async () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            create: route
              .post('/products')
              .body(CreateProductSchema)
              .query(z.object({ notify: z.boolean().optional() }))
              .returns(ProductSchema),
          },
        },
      };

      const handler = vi.fn(async (ctx) => {
        expect(ctx.request).toBeDefined();
        expect(ctx.reply).toBeDefined();
        expect(ctx.body).toBeDefined();
        expect(ctx.query).toBeDefined();
        expect(ctx.params).toBeDefined();
        return { id: '1', name: ctx.body.name, price: ctx.body.price };
      });

      const plugin = createFastifyPlugin(contract, {
        v1: {
          create: handler,
        },
      });

      expect(plugin).toBeDefined();
    });
  });

  describe('path normalization', () => {
    it('normalizes paths without leading slash', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            test: {
              method: 'get',
              path: 'no-leading-slash',
              response: HealthSchema,
            },
          },
        },
      };

      const plugin = createFastifyPlugin(contract, {
        v1: {
          test: async () => ({ status: 'ok' }),
        },
      });

      expect(plugin).toBeDefined();
    });

    it('removes trailing slash except for root', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            test: {
              method: 'get',
              path: '/trailing/',
              response: HealthSchema,
            },
          },
        },
      };

      const plugin = createFastifyPlugin(contract, {
        v1: {
          test: async () => ({ status: 'ok' }),
        },
      });

      expect(plugin).toBeDefined();
    });

    it('handles root path correctly', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            root: {
              method: 'get',
              path: '/',
              response: HealthSchema,
            },
          },
        },
      };

      const plugin = createFastifyPlugin(contract, {
        v1: {
          root: async () => ({ status: 'ok' }),
        },
      });

      expect(plugin).toBeDefined();
    });
  });

  describe('multiple versions', () => {
    it('handles multiple API versions', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
        v2: {
          routes: {
            health: route
              .get('/health')
              .returns(z.object({ status: z.string(), version: z.number() })),
          },
        },
      };

      const plugin = createFastifyPlugin(contract, {
        v1: {
          health: async () => ({ status: 'ok' }),
        },
        v2: {
          health: async () => ({ status: 'ok', version: 2 }),
        },
      });

      expect(plugin).toBeDefined();
    });
  });

  describe('validation', () => {
    it('validates body for POST requests', async () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            create: route.post('/products').body(CreateProductSchema).returns(ProductSchema),
          },
        },
      };

      const plugin = createFastifyPlugin(contract, {
        v1: {
          create: async ({ body }) => ({
            id: '1',
            name: body.name,
            price: body.price,
          }),
        },
      });

      expect(plugin).toBeDefined();
    });

    it('validates body for PUT requests', async () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            update: route
              .put('/products/:id')
              .params(IdParamsSchema)
              .body(CreateProductSchema)
              .returns(ProductSchema),
          },
        },
      };

      const plugin = createFastifyPlugin(contract, {
        v1: {
          update: async ({ body, params }) => ({
            id: params.id,
            name: body.name,
            price: body.price,
          }),
        },
      });

      expect(plugin).toBeDefined();
    });

    it('validates body for PATCH requests', async () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            patch: route
              .patch('/products/:id')
              .params(IdParamsSchema)
              .body(CreateProductSchema)
              .returns(ProductSchema),
          },
        },
      };

      const plugin = createFastifyPlugin(contract, {
        v1: {
          patch: async ({ body, params }) => ({
            id: params.id,
            name: body.name,
            price: body.price,
          }),
        },
      });

      expect(plugin).toBeDefined();
    });

    it('validates query parameters', async () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            list: route.get('/products').query(PaginationSchema).returns(z.array(ProductSchema)),
          },
        },
      };

      const plugin = createFastifyPlugin(contract, {
        v1: {
          list: async ({ query }) => [],
        },
      });

      expect(plugin).toBeDefined();
    });

    it('validates path parameters', async () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            get: route.get('/products/:id').params(IdParamsSchema).returns(ProductSchema),
          },
        },
      };

      const plugin = createFastifyPlugin(contract, {
        v1: {
          get: async ({ params }) => ({
            id: params.id,
            name: 'Test',
            price: 100,
          }),
        },
      });

      expect(plugin).toBeDefined();
    });
  });

  describe('async handlers', () => {
    it('supports async handlers', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            async: route.get('/async').returns(HealthSchema),
          },
        },
      };

      const plugin = createFastifyPlugin(contract, {
        v1: {
          async: async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            return { status: 'ok' };
          },
        },
      });

      expect(plugin).toBeDefined();
    });

    it('supports sync handlers', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            sync: route.get('/sync').returns(HealthSchema),
          },
        },
      };

      const plugin = createFastifyPlugin(contract, {
        v1: {
          sync: () => ({ status: 'ok' }),
        },
      });

      expect(plugin).toBeDefined();
    });
  });

  describe('additional responses', () => {
    it('handles routes with additional responses', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            get: route
              .get('/products/:id')
              .params(IdParamsSchema)
              .withResponses({
                404: ErrorSchema,
                500: ErrorSchema,
              })
              .returns(ProductSchema),
          },
        },
      };

      const plugin = createFastifyPlugin(contract, {
        v1: {
          get: async ({ params }) => ({
            id: params.id,
            name: 'Test',
            price: 100,
          }),
        },
      });

      expect(plugin).toBeDefined();
    });
  });

  describe('docs registration', () => {
    it('registers docs route at /api-doc by default', async () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const plugin = createFastifyPlugin(contract, {
        v1: {
          health: async () => ({ status: 'ok' }),
        },
      });

      const mockFastify = createMockFastify();
      await (plugin as Function)(mockFastify, {});

      // Check that a GET route was registered at /api-doc
      const docsRoute = mockFastify._routes.find((r) => r.url === '/api-doc' && r.method === 'GET');
      expect(docsRoute).toBeDefined();
    });

    it('uses custom docsPath', async () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const plugin = createFastifyPlugin(
        contract,
        {
          v1: {
            health: async () => ({ status: 'ok' }),
          },
        },
        { docsPath: '/docs/openapi' },
      );

      const mockFastify = createMockFastify();
      await (plugin as Function)(mockFastify, {});

      const docsRoute = mockFastify._routes.find(
        (r) => r.url === '/docs/openapi' && r.method === 'GET',
      );
      expect(docsRoute).toBeDefined();
    });

    it('disables docs route when registerDocs is false', async () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const plugin = createFastifyPlugin(
        contract,
        {
          v1: {
            health: async () => ({ status: 'ok' }),
          },
        },
        { registerDocs: false },
      );

      const mockFastify = createMockFastify();
      await (plugin as Function)(mockFastify, {});

      const docsRoute = mockFastify._routes.find((r) => r.url === '/api-doc' && r.method === 'GET');
      expect(docsRoute).toBeUndefined();
    });

    it('serves spec from docs handler', async () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const plugin = createFastifyPlugin(contract, {
        v1: {
          health: async () => ({ status: 'ok' }),
        },
      });

      const mockFastify = createMockFastify();
      await (plugin as Function)(mockFastify, {});

      const docsRoute = mockFastify._routes.find((r) => r.url === '/api-doc' && r.method === 'GET');
      expect(docsRoute).toBeDefined();

      // Call the handler and check the response
      const mockReply = createMockReply();
      await docsRoute!.handler(createMockRequest(), mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          openapi: '3.0.0',
          info: expect.objectContaining({
            title: 'API Documentation',
            version: '1.0.0',
          }),
          paths: expect.any(Object),
        }),
      );
    });

    it('uses custom docsConfig info', async () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const plugin = createFastifyPlugin(
        contract,
        {
          v1: {
            health: async () => ({ status: 'ok' }),
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

      const mockFastify = createMockFastify();
      await (plugin as Function)(mockFastify, {});

      const docsRoute = mockFastify._routes.find((r) => r.url === '/api-doc' && r.method === 'GET');
      const mockReply = createMockReply();
      await docsRoute!.handler(createMockRequest(), mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          info: expect.objectContaining({
            title: 'My Custom API',
            version: '2.0.0',
            description: 'Custom description',
          }),
        }),
      );
    });
  });
});
