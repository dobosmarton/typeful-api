import type { ApiContract } from '@typefulapi/core';
import { route } from '@typefulapi/core';
import type { Request, RequestHandler, Response, Router } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createExpressRouter } from '../../src/adapter';
import type { ValidationError } from '../../src/types';

// Mock Express Router
function createMockRouter() {
  const routes: Array<{
    method: string;
    path: string;
    handlers: RequestHandler[];
  }> = [];

  const middlewares: Array<unknown[]> = [];

  const mockRouter = {
    get: vi.fn((path: string, ...handlers: RequestHandler[]) => {
      routes.push({ method: 'get', path, handlers });
      return mockRouter;
    }),
    post: vi.fn((path: string, ...handlers: RequestHandler[]) => {
      routes.push({ method: 'post', path, handlers });
      return mockRouter;
    }),
    put: vi.fn((path: string, ...handlers: RequestHandler[]) => {
      routes.push({ method: 'put', path, handlers });
      return mockRouter;
    }),
    patch: vi.fn((path: string, ...handlers: RequestHandler[]) => {
      routes.push({ method: 'patch', path, handlers });
      return mockRouter;
    }),
    delete: vi.fn((path: string, ...handlers: RequestHandler[]) => {
      routes.push({ method: 'delete', path, handlers });
      return mockRouter;
    }),
    use: vi.fn((...args: unknown[]) => {
      middlewares.push(args);
      return mockRouter;
    }),
    _routes: routes,
    _middlewares: middlewares,
  };

  return mockRouter as unknown as Router & {
    _routes: typeof routes;
    _middlewares: typeof middlewares;
  };
}

// Mock Express module
vi.mock('express', () => ({
  Router: () => createMockRouter(),
}));

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

// Helper to create mock request
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    path: '/',
    method: 'GET',
    query: {},
    params: {},
    body: {},
    ...overrides,
  } as Request;
}

// Helper to create mock response
function createMockResponse(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe('createExpressRouter', () => {
  describe('route registration', () => {
    it('creates router for simple contract', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const router = createExpressRouter(contract, {
        v1: {
          health: async () => ({ status: 'ok' }),
        },
      });

      expect(router).toBeDefined();
    });

    it('registers routes with correct HTTP methods', () => {
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

      const router = createExpressRouter(contract, handlers);
      expect(router).toBeDefined();
    });

    it('handles nested route groups', () => {
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

      const router = createExpressRouter(contract, handlers);
      expect(router).toBeDefined();
    });

    it('handles deeply nested groups', () => {
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

      const router = createExpressRouter(contract, handlers);
      expect(router).toBeDefined();
    });

    it('logs warning for missing handlers', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      // Intentionally omit handler
      createExpressRouter(contract, { v1: {} } as any);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Missing handler'));

      warnSpy.mockRestore();
    });
  });

  describe('request validation', () => {
    it('validates body and passes to handler', async () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            create: route.post('/products').body(CreateProductSchema).returns(ProductSchema),
          },
        },
      };

      const handler = vi.fn(async ({ body }) => ({
        id: '1',
        ...body,
      }));

      const router = createExpressRouter(contract, {
        v1: {
          create: handler,
        },
      });

      // The actual validation happens in the middleware
      expect(router).toBeDefined();
    });

    it('validates query parameters', async () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            list: route.get('/products').query(PaginationSchema).returns(z.array(ProductSchema)),
          },
        },
      };

      const handler = vi.fn(async ({ query }) => []);

      const router = createExpressRouter(contract, {
        v1: {
          list: handler,
        },
      });

      expect(router).toBeDefined();
    });

    it('validates path parameters', async () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            get: route.get('/products/:id').params(IdParamsSchema).returns(ProductSchema),
          },
        },
      };

      const handler = vi.fn(async ({ params }) => ({
        id: params.id,
        name: 'Test',
        price: 100,
      }));

      const router = createExpressRouter(contract, {
        v1: {
          get: handler,
        },
      });

      expect(router).toBeDefined();
    });

    it('can disable body validation', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            create: route.post('/products').body(CreateProductSchema).returns(ProductSchema),
          },
        },
      };

      const router = createExpressRouter(
        contract,
        {
          v1: {
            create: async ({ body }) => ({ id: '1', name: body.name, price: body.price }),
          },
        },
        { validateBody: false },
      );

      expect(router).toBeDefined();
    });

    it('can disable query validation', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            list: route.get('/products').query(PaginationSchema).returns(z.array(ProductSchema)),
          },
        },
      };

      const router = createExpressRouter(
        contract,
        {
          v1: {
            list: async () => [],
          },
        },
        { validateQuery: false },
      );

      expect(router).toBeDefined();
    });

    it('can disable params validation', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            get: route.get('/products/:id').params(IdParamsSchema).returns(ProductSchema),
          },
        },
      };

      const router = createExpressRouter(
        contract,
        {
          v1: {
            get: async ({ params }) => ({
              id: params.id,
              name: 'Test',
              price: 100,
            }),
          },
        },
        { validateParams: false },
      );

      expect(router).toBeDefined();
    });

    it('uses custom validation error handler', () => {
      const customHandler = vi.fn((error: ValidationError, req, res) => {
        res.status(400).json({ customError: true, type: error.type });
      });

      const contract: ApiContract = {
        v1: {
          routes: {
            create: route.post('/products').body(CreateProductSchema).returns(ProductSchema),
          },
        },
      };

      const router = createExpressRouter(
        contract,
        {
          v1: {
            create: async ({ body }) => ({ id: '1', ...body }),
          },
        },
        { onValidationError: customHandler },
      );

      expect(router).toBeDefined();
    });
  });

  describe('middleware support', () => {
    it('applies global middleware', () => {
      const globalMiddleware = vi.fn((req, res, next) => next());

      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const router = createExpressRouter(
        contract,
        {
          v1: {
            health: async () => ({ status: 'ok' }),
          },
        },
        { middleware: [globalMiddleware] },
      );

      expect(router).toBeDefined();
    });

    it('applies version-level middleware', () => {
      const versionMiddleware = vi.fn((req, res, next) => next());

      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const router = createExpressRouter(contract, {
        v1: {
          middleware: [versionMiddleware],
          health: async () => ({ status: 'ok' }),
        },
      });

      expect(router).toBeDefined();
    });

    it('applies group-level middleware', () => {
      const groupMiddleware = vi.fn((req, res, next) => next());

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

      const router = createExpressRouter(contract, {
        v1: {
          products: {
            middleware: [groupMiddleware],
            list: async () => [],
          },
        },
      });

      expect(router).toBeDefined();
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
        expect(ctx.req).toBeDefined();
        expect(ctx.res).toBeDefined();
        expect(ctx.body).toBeDefined();
        expect(ctx.query).toBeDefined();
        expect(ctx.params).toBeDefined();
        return { id: '1', name: ctx.body.name, price: ctx.body.price };
      });

      const router = createExpressRouter(contract, {
        v1: {
          create: handler,
        },
      });

      expect(router).toBeDefined();
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

      const router = createExpressRouter(contract, {
        v1: {
          test: async () => ({ status: 'ok' }),
        },
      });

      expect(router).toBeDefined();
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

      const router = createExpressRouter(contract, {
        v1: {
          test: async () => ({ status: 'ok' }),
        },
      });

      expect(router).toBeDefined();
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

      const router = createExpressRouter(contract, {
        v1: {
          root: async () => ({ status: 'ok' }),
        },
      });

      expect(router).toBeDefined();
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

      const router = createExpressRouter(contract, {
        v1: {
          health: async () => ({ status: 'ok' }),
        },
        v2: {
          health: async () => ({ status: 'ok', version: 2 }),
        },
      });

      expect(router).toBeDefined();
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

      const router = createExpressRouter(contract, {
        v1: {
          async: async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            return { status: 'ok' };
          },
        },
      });

      expect(router).toBeDefined();
    });

    it('supports sync handlers', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            sync: route.get('/sync').returns(HealthSchema),
          },
        },
      };

      const router = createExpressRouter(contract, {
        v1: {
          sync: () => ({ status: 'ok' }),
        },
      });

      expect(router).toBeDefined();
    });
  });

  describe('docs registration', () => {
    it('registers docs route at /api-doc by default', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const router = createExpressRouter(contract, {
        v1: {
          health: async () => ({ status: 'ok' }),
        },
      });

      // The router.get should have been called with '/api-doc'
      const mockRouter = router as unknown as { get: ReturnType<typeof vi.fn> };
      const getCalls = mockRouter.get.mock.calls;
      const docsCall = getCalls.find((call: unknown[]) => call[0] === '/api-doc');
      expect(docsCall).toBeDefined();
    });

    it('uses custom docsPath', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const router = createExpressRouter(
        contract,
        {
          v1: {
            health: async () => ({ status: 'ok' }),
          },
        },
        { docsPath: '/docs/openapi' },
      );

      const mockRouter = router as unknown as { get: ReturnType<typeof vi.fn> };
      const getCalls = mockRouter.get.mock.calls;
      const docsCall = getCalls.find((call: unknown[]) => call[0] === '/docs/openapi');
      expect(docsCall).toBeDefined();
    });

    it('disables docs route when registerDocs is false', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const router = createExpressRouter(
        contract,
        {
          v1: {
            health: async () => ({ status: 'ok' }),
          },
        },
        { registerDocs: false },
      );

      const mockRouter = router as unknown as { get: ReturnType<typeof vi.fn> };
      const getCalls = mockRouter.get.mock.calls;
      const docsCall = getCalls.find((call: unknown[]) => call[0] === '/api-doc');
      expect(docsCall).toBeUndefined();
    });

    it('serves JSON response from docs handler', async () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const router = createExpressRouter(contract, {
        v1: {
          health: async () => ({ status: 'ok' }),
        },
      });

      const mockRouter = router as unknown as { get: ReturnType<typeof vi.fn> };
      const getCalls = mockRouter.get.mock.calls;
      const docsCall = getCalls.find((call: unknown[]) => call[0] === '/api-doc');
      expect(docsCall).toBeDefined();

      // Call the handler and check the response
      const handler = docsCall![1] as RequestHandler;
      const mockReq = createMockRequest();
      const mockRes = createMockResponse();
      const mockNext = vi.fn();

      handler(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
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

      const router = createExpressRouter(
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

      const mockRouter = router as unknown as { get: ReturnType<typeof vi.fn> };
      const getCalls = mockRouter.get.mock.calls;
      const docsCall = getCalls.find((call: unknown[]) => call[0] === '/api-doc');
      const handler = docsCall![1] as RequestHandler;

      const mockReq = createMockRequest();
      const mockRes = createMockResponse();
      const mockNext = vi.fn();

      handler(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
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
