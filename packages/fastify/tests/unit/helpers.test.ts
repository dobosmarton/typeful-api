import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import {
  createPreHandler,
  getLocals,
  setLocals,
  mergeLocals,
  createLocalsPreHandler,
  conditionalPreHandler,
  composePreHandlers,
  decorateInstance,
} from '../../src/helpers';

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
function createMockReply(overrides: Partial<FastifyReply> = {}): FastifyReply {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    sent: false,
    ...overrides,
  } as unknown as FastifyReply;
}

describe('Fastify helpers', () => {
  describe('createPreHandler', () => {
    it('wraps handler function as preHandler', async () => {
      const handler = vi.fn(async (request, reply) => {
        // Handler logic
      });

      const preHandler = createPreHandler(handler);

      const request = createMockRequest();
      const reply = createMockReply();

      await preHandler.call({}, request, reply);

      expect(handler).toHaveBeenCalled();
    });

    it('maintains async behavior', async () => {
      let executed = false;

      const preHandler = createPreHandler(async (request, reply) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        executed = true;
      });

      const request = createMockRequest();
      const reply = createMockReply();

      await preHandler.call({}, request, reply);

      expect(executed).toBe(true);
    });
  });

  describe('getLocals', () => {
    it('retrieves typed locals from request', () => {
      const request = createMockRequest() as any;
      request.locals = { user: { id: '123', name: 'John' } };

      const locals = getLocals<{ user: { id: string; name: string } }>(request);

      expect(locals.user.id).toBe('123');
      expect(locals.user.name).toBe('John');
    });

    it('returns undefined for missing locals', () => {
      const request = createMockRequest();

      const locals = getLocals<{ value: string }>(request);

      expect(locals).toBeUndefined();
    });
  });

  describe('setLocals', () => {
    it('sets locals on request', () => {
      const request = createMockRequest();

      setLocals(request, { user: { id: '123' } });

      expect((request as any).locals).toEqual({ user: { id: '123' } });
    });

    it('overwrites existing locals', () => {
      const request = createMockRequest() as any;
      request.locals = { old: 'value' };

      setLocals(request, { new: 'value' });

      expect((request as any).locals).toEqual({ new: 'value' });
      expect((request as any).locals.old).toBeUndefined();
    });
  });

  describe('mergeLocals', () => {
    it('merges with existing locals', () => {
      const request = createMockRequest() as any;
      request.locals = { existing: 'data' };

      mergeLocals(request, { new: 'data' });

      expect((request as any).locals).toEqual({
        existing: 'data',
        new: 'data',
      });
    });

    it('creates locals object if not present', () => {
      const request = createMockRequest();

      mergeLocals(request, { value: 'test' });

      expect((request as any).locals).toEqual({ value: 'test' });
    });

    it('overwrites conflicting keys', () => {
      const request = createMockRequest() as any;
      request.locals = { key: 'old' };

      mergeLocals(request, { key: 'new' });

      expect((request as any).locals.key).toBe('new');
    });
  });

  describe('createLocalsPreHandler', () => {
    it('sets local value from sync factory', async () => {
      const request = createMockRequest();
      const reply = createMockReply();

      const preHandler = createLocalsPreHandler('config', () => ({
        apiKey: 'test-key',
      }));

      await preHandler.call({}, request, reply);

      expect((request as any).locals.config).toEqual({ apiKey: 'test-key' });
    });

    it('sets local value from async factory', async () => {
      const request = createMockRequest();
      const reply = createMockReply();

      const preHandler = createLocalsPreHandler('user', async () => {
        return { id: '123', name: 'John' };
      });

      await preHandler.call({}, request, reply);

      expect((request as any).locals.user).toEqual({ id: '123', name: 'John' });
    });

    it('receives request in factory function', async () => {
      const request = createMockRequest({ url: '/test' });
      const reply = createMockReply();

      const factory = vi.fn((req: FastifyRequest) => req.url);

      const preHandler = createLocalsPreHandler('url', factory);
      await preHandler.call({}, request, reply);

      expect(factory).toHaveBeenCalledWith(request);
      expect((request as any).locals.url).toBe('/test');
    });

    it('merges with existing locals', async () => {
      const request = createMockRequest() as any;
      request.locals = { existing: 'value' };
      const reply = createMockReply();

      const preHandler = createLocalsPreHandler('new', () => 'value');
      await preHandler.call({}, request, reply);

      expect(request.locals).toEqual({
        existing: 'value',
        new: 'value',
      });
    });
  });

  describe('conditionalPreHandler', () => {
    it('runs preHandler when condition is true', async () => {
      const request = createMockRequest({ url: '/admin' });
      const reply = createMockReply();
      const innerHandler = vi.fn(async () => {});

      const conditional = conditionalPreHandler(
        (req) => req.url.startsWith('/admin'),
        innerHandler,
      );

      await conditional.call({}, request, reply);

      expect(innerHandler).toHaveBeenCalled();
    });

    it('skips preHandler when condition is false', async () => {
      const request = createMockRequest({ url: '/public' });
      const reply = createMockReply();
      const innerHandler = vi.fn(async () => {});

      const conditional = conditionalPreHandler(
        (req) => req.url.startsWith('/admin'),
        innerHandler,
      );

      await conditional.call({}, request, reply);

      expect(innerHandler).not.toHaveBeenCalled();
    });

    it('evaluates condition with request', async () => {
      const request = createMockRequest({ method: 'POST' });
      const reply = createMockReply();

      const condition = vi.fn((req) => req.method === 'POST');
      const innerHandler = vi.fn(async () => {});

      const conditional = conditionalPreHandler(condition, innerHandler);
      await conditional.call({}, request, reply);

      expect(condition).toHaveBeenCalledWith(request);
    });
  });

  describe('composePreHandlers', () => {
    it('runs handlers in sequence', async () => {
      const order: number[] = [];
      const request = createMockRequest();
      const reply = createMockReply();

      const handler1 = vi.fn(async () => {
        order.push(1);
      });
      const handler2 = vi.fn(async () => {
        order.push(2);
      });
      const handler3 = vi.fn(async () => {
        order.push(3);
      });

      const composed = composePreHandlers([handler1, handler2, handler3]);
      await composed.call({}, request, reply);

      expect(order).toEqual([1, 2, 3]);
    });

    it('stops if reply.sent is true', async () => {
      const request = createMockRequest();
      const reply = createMockReply();

      const handler1 = vi.fn(async (req, rep) => {
        (rep as any).sent = true;
      });
      const handler2 = vi.fn(async () => {});

      const composed = composePreHandlers([handler1, handler2]);
      await composed.call({}, request, reply);

      expect(handler1).toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('awaits async handlers', async () => {
      let completed = false;
      const request = createMockRequest();
      const reply = createMockReply();

      const asyncHandler = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        completed = true;
      });

      const composed = composePreHandlers([asyncHandler]);
      await composed.call({}, request, reply);

      expect(completed).toBe(true);
    });

    it('handles empty handler array', async () => {
      const request = createMockRequest();
      const reply = createMockReply();

      const composed = composePreHandlers([]);
      await expect(composed.call({}, request, reply)).resolves.toBeUndefined();
    });
  });

  describe('decorateInstance', () => {
    it('adds properties to Fastify instance', () => {
      const mockFastify = {
        decorate: vi.fn(),
      } as unknown as FastifyInstance;

      decorateInstance(mockFastify, {
        config: { apiKey: 'test' },
        db: { connection: 'mongodb://...' },
      });

      expect(mockFastify.decorate).toHaveBeenCalledTimes(2);
      expect(mockFastify.decorate).toHaveBeenCalledWith('config', { apiKey: 'test' });
      expect(mockFastify.decorate).toHaveBeenCalledWith('db', { connection: 'mongodb://...' });
    });

    it('handles empty decorations object', () => {
      const mockFastify = {
        decorate: vi.fn(),
      } as unknown as FastifyInstance;

      decorateInstance(mockFastify, {});

      expect(mockFastify.decorate).not.toHaveBeenCalled();
    });
  });
});
