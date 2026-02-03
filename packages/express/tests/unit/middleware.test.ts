import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  createTypedMiddleware,
  composeMiddleware,
  getLocals,
  conditionalMiddleware,
  createLocalsMiddleware,
  createErrorHandler,
} from '../../src/middleware';

// Mock factory for Express request
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

// Mock factory for Express response
function createMockResponse(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe('Express middleware helpers', () => {
  describe('createTypedMiddleware', () => {
    it('initializes locals object if not present', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = createTypedMiddleware<{ value: string }>(async (req, res, next) => {
        req.locals.value = 'test';
        next();
      });

      await middleware(req, res, next);

      expect((req as any).locals).toBeDefined();
      expect((req as any).locals.value).toBe('test');
      expect(next).toHaveBeenCalled();
    });

    it('preserves existing locals', async () => {
      const req = createMockRequest() as any;
      req.locals = { existing: 'data' };
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = createTypedMiddleware<{ existing: string; value: string }>(
        async (req, res, next) => {
          req.locals.value = 'new';
          next();
        },
      );

      await middleware(req, res, next);

      expect(req.locals.existing).toBe('data');
      expect(req.locals.value).toBe('new');
    });

    it('passes correct arguments to handler', async () => {
      const req = createMockRequest({ path: '/test' });
      const res = createMockResponse();
      const next = vi.fn();

      const handler = vi.fn((req, res, next) => {
        next();
      });

      const middleware = createTypedMiddleware(handler);
      await middleware(req, res, next);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/test' }),
        res,
        next,
      );
    });
  });

  describe('getLocals', () => {
    it('retrieves typed locals from request', () => {
      const req = createMockRequest() as any;
      req.locals = { user: { id: '123', name: 'John' } };

      const locals = getLocals<{ user: { id: string; name: string } }>(req);

      expect(locals.user.id).toBe('123');
      expect(locals.user.name).toBe('John');
    });

    it('returns undefined for missing locals', () => {
      const req = createMockRequest();

      const locals = getLocals<{ value: string }>(req);

      expect(locals).toBeUndefined();
    });
  });

  describe('composeMiddleware', () => {
    it('runs middleware in sequence', async () => {
      const order: number[] = [];
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware1 = vi.fn((req, res, next) => {
        order.push(1);
        next();
      });
      const middleware2 = vi.fn((req, res, next) => {
        order.push(2);
        next();
      });
      const middleware3 = vi.fn((req, res, next) => {
        order.push(3);
        next();
      });

      const composed = composeMiddleware([middleware1, middleware2, middleware3]);
      composed(req, res, next);

      expect(order).toEqual([1, 2, 3]);
      expect(next).toHaveBeenCalled();
    });

    it('stops on error and calls next(error)', () => {
      const error = new Error('Test error');
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware1 = vi.fn((req, res, next) => {
        next(error);
      });
      const middleware2 = vi.fn((req, res, next) => {
        next();
      });

      const composed = composeMiddleware([middleware1, middleware2]);
      composed(req, res, next);

      expect(middleware2).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(error);
    });

    it('catches synchronous errors', () => {
      const error = new Error('Sync error');
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware1 = vi.fn(() => {
        throw error;
      });

      const composed = composeMiddleware([middleware1]);
      composed(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('calls next() when all middleware complete', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware1 = vi.fn((req, res, next) => next());
      const middleware2 = vi.fn((req, res, next) => next());

      const composed = composeMiddleware([middleware1, middleware2]);
      composed(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('handles empty middleware array', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const composed = composeMiddleware([]);
      composed(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('conditionalMiddleware', () => {
    it('runs middleware when condition is true', () => {
      const req = createMockRequest({ path: '/admin' });
      const res = createMockResponse();
      const next = vi.fn();

      const innerMiddleware = vi.fn((req, res, next) => next());

      const conditional = conditionalMiddleware(
        (req) => req.path.startsWith('/admin'),
        innerMiddleware,
      );

      conditional(req, res, next);

      expect(innerMiddleware).toHaveBeenCalled();
    });

    it('skips middleware when condition is false', () => {
      const req = createMockRequest({ path: '/public' });
      const res = createMockResponse();
      const next = vi.fn();

      const innerMiddleware = vi.fn((req, res, next) => next());

      const conditional = conditionalMiddleware(
        (req) => req.path.startsWith('/admin'),
        innerMiddleware,
      );

      conditional(req, res, next);

      expect(innerMiddleware).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('evaluates condition with request', () => {
      const req = createMockRequest({ method: 'POST' });
      const res = createMockResponse();
      const next = vi.fn();

      const condition = vi.fn((req) => req.method === 'POST');
      const innerMiddleware = vi.fn((req, res, next) => next());

      const conditional = conditionalMiddleware(condition, innerMiddleware);
      conditional(req, res, next);

      expect(condition).toHaveBeenCalledWith(req);
    });
  });

  describe('createLocalsMiddleware', () => {
    it('sets local value from synchronous factory', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = createLocalsMiddleware('config', () => ({
        apiKey: 'test-key',
      }));

      await middleware(req, res, next);

      expect((req as any).locals.config).toEqual({ apiKey: 'test-key' });
      expect(next).toHaveBeenCalled();
    });

    it('sets local value from async factory', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = createLocalsMiddleware('user', async () => {
        return { id: '123', name: 'John' };
      });

      await middleware(req, res, next);

      expect((req as any).locals.user).toEqual({ id: '123', name: 'John' });
    });

    it('initializes locals object if not present', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = createLocalsMiddleware('value', () => 'test');

      await middleware(req, res, next);

      expect((req as any).locals).toBeDefined();
      expect((req as any).locals.value).toBe('test');
    });

    it('passes factory errors to next()', async () => {
      const error = new Error('Factory error');
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = createLocalsMiddleware('value', async () => {
        throw error;
      });

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('receives request in factory function', async () => {
      const req = createMockRequest({ path: '/test' });
      const res = createMockResponse();
      const next = vi.fn();

      const factory = vi.fn((req: Request) => req.path);

      const middleware = createLocalsMiddleware('path', factory);
      await middleware(req, res, next);

      expect(factory).toHaveBeenCalledWith(req);
      expect((req as any).locals.path).toBe('/test');
    });
  });

  describe('createErrorHandler', () => {
    it('wraps error handler correctly', () => {
      const error = new Error('Test error');
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const handler = vi.fn((error, req, res) => {
        res.status(500).json({ error: error.message });
      });

      const errorHandler = createErrorHandler(handler);
      errorHandler(error, req, res, next);

      expect(handler).toHaveBeenCalledWith(error, req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Test error' });
    });

    it('receives correct error object', () => {
      const error = new Error('Custom error');
      error.name = 'CustomError';
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const handler = vi.fn();
      const errorHandler = createErrorHandler(handler);
      errorHandler(error, req, res, next);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Custom error',
          name: 'CustomError',
        }),
        req,
        res,
      );
    });
  });
});
