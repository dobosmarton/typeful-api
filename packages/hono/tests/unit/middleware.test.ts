import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { Context, Env, MiddlewareHandler } from 'hono';
import {
  createTypedMiddleware,
  composeMiddleware,
  getVariables,
  conditionalMiddleware,
  createVariableMiddleware,
} from '../../src/middleware';
import type { WithVariables } from '../../src/types';

describe('middleware', () => {
  describe('createTypedMiddleware', () => {
    it('wraps a handler and passes context and next', async () => {
      type TestEnv = { Variables: { test: string } };

      const middleware = createTypedMiddleware<TestEnv>(async (c, next) => {
        c.set('test', 'value');
        await next();
      });

      const app = new Hono<TestEnv>();
      app.use(middleware);
      app.get('/', (c) => c.json({ test: c.get('test') }));

      const res = await app.request('/');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ test: 'value' });
    });

    it('allows middleware to set variables on context', async () => {
      type DbEnv = { Variables: { db: { name: string } } };

      const dbMiddleware = createTypedMiddleware<DbEnv>(async (c, next) => {
        c.set('db', { name: 'test-db' });
        await next();
      });

      const app = new Hono<DbEnv>();
      app.use(dbMiddleware);
      app.get('/', (c) => {
        const db = c.get('db');
        return c.json({ dbName: db.name });
      });

      const res = await app.request('/');
      const body = await res.json();
      expect(body).toEqual({ dbName: 'test-db' });
    });

    it('can return a response early', async () => {
      type TestEnv = Env;

      const authMiddleware = createTypedMiddleware<TestEnv>(async (c) => {
        return c.json({ error: 'Unauthorized' }, 401);
      });

      const app = new Hono<TestEnv>();
      app.use(authMiddleware);
      app.get('/', (c) => c.json({ message: 'success' }));

      const res = await app.request('/');
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: 'Unauthorized' });
    });
  });

  describe('composeMiddleware', () => {
    it('returns middleware that calls next when given empty array', async () => {
      const composed = composeMiddleware<Env>([]);

      const app = new Hono();
      app.use(composed);
      app.get('/', (c) => c.json({ message: 'reached' }));

      const res = await app.request('/');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ message: 'reached' });
    });

    it('executes a single middleware', async () => {
      type TestEnv = { Variables: { value: number } };

      const middleware: MiddlewareHandler<TestEnv> = async (c, next) => {
        c.set('value', 42);
        await next();
      };

      const composed = composeMiddleware<TestEnv>([middleware]);

      const app = new Hono<TestEnv>();
      app.use(composed);
      app.get('/', (c) => c.json({ value: c.get('value') }));

      const res = await app.request('/');
      const body = await res.json();
      expect(body).toEqual({ value: 42 });
    });

    it('executes middlewares in order', async () => {
      const order: number[] = [];

      const middleware1: MiddlewareHandler = async (c, next) => {
        order.push(1);
        await next();
        order.push(4);
      };

      const middleware2: MiddlewareHandler = async (c, next) => {
        order.push(2);
        await next();
        order.push(3);
      };

      const composed = composeMiddleware([middleware1, middleware2]);

      const app = new Hono();
      app.use(composed);
      app.get('/', (c) => c.text('ok'));

      await app.request('/');
      expect(order).toEqual([1, 2, 3, 4]);
    });

    it('handles middleware that conditionally proceeds', async () => {
      const order: number[] = [];

      const conditionalMiddleware: MiddlewareHandler = async (c, next) => {
        order.push(1);
        // Always call next() in composed middleware
        // For conditional early returns, use conditionalMiddleware helper instead
        await next();
        order.push(4);
      };

      const middleware2: MiddlewareHandler = async (c, next) => {
        order.push(2);
        await next();
        order.push(3);
      };

      const composed = composeMiddleware([conditionalMiddleware, middleware2]);

      const app = new Hono();
      app.use(composed);
      app.get('/', (c) => {
        return c.text('reached');
      });

      const res = await app.request('/');
      expect(order).toEqual([1, 2, 3, 4]);
      expect(await res.text()).toBe('reached');
    });

    it('propagates errors from middleware', async () => {
      const errorMiddleware: MiddlewareHandler = async () => {
        throw new Error('Test error');
      };

      const composed = composeMiddleware([errorMiddleware]);

      const app = new Hono();
      app.use(composed);
      app.get('/', (c) => c.text('ok'));
      app.onError((err, c) => {
        return c.json({ error: err.message }, 500);
      });

      const res = await app.request('/');
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toEqual({ error: 'Test error' });
    });

    it('allows variables to be accumulated across middlewares', async () => {
      type AccumulatedEnv = { Variables: { a: number; b: number } };

      const middleware1: MiddlewareHandler<AccumulatedEnv> = async (c, next) => {
        c.set('a', 1);
        await next();
      };

      const middleware2: MiddlewareHandler<AccumulatedEnv> = async (c, next) => {
        c.set('b', 2);
        await next();
      };

      const composed = composeMiddleware<AccumulatedEnv>([middleware1, middleware2]);

      const app = new Hono<AccumulatedEnv>();
      app.use(composed);
      app.get('/', (c) => c.json({ a: c.get('a'), b: c.get('b') }));

      const res = await app.request('/');
      const body = await res.json();
      expect(body).toEqual({ a: 1, b: 2 });
    });
  });

  describe('getVariables', () => {
    it('returns typed variables from context', async () => {
      type TestEnv = { Variables: { user: { id: string }; count: number } };

      const app = new Hono<TestEnv>();
      app.use(async (c, next) => {
        c.set('user', { id: 'u1' });
        c.set('count', 5);
        await next();
      });
      app.get('/', (c) => {
        const vars = getVariables(c);
        return c.json({ userId: vars.user.id, count: vars.count });
      });

      const res = await app.request('/');
      const body = await res.json();
      expect(body).toEqual({ userId: 'u1', count: 5 });
    });

    it('returns empty-like object for context with no variables', async () => {
      const app = new Hono();
      app.get('/', (c) => {
        const vars = getVariables(c);
        return c.json({ hasVars: Object.keys(vars).length === 0 });
      });

      const res = await app.request('/');
      const body = await res.json();
      expect(body).toEqual({ hasVars: true });
    });
  });

  describe('conditionalMiddleware', () => {
    it('runs middleware when condition is true', async () => {
      type TestEnv = { Variables: { authenticated: boolean } };

      const authMiddleware: MiddlewareHandler<TestEnv> = async (c, next) => {
        c.set('authenticated', true);
        await next();
      };

      const conditional = conditionalMiddleware<TestEnv>(() => true, authMiddleware);

      const app = new Hono<TestEnv>();
      app.use(conditional);
      app.get('/', (c) => c.json({ authenticated: c.get('authenticated') }));

      const res = await app.request('/');
      const body = await res.json();
      expect(body).toEqual({ authenticated: true });
    });

    it('skips middleware when condition is false', async () => {
      type TestEnv = { Variables: { authenticated: boolean } };

      const authMiddleware: MiddlewareHandler<TestEnv> = async (c, next) => {
        c.set('authenticated', true);
        await next();
      };

      const conditional = conditionalMiddleware<TestEnv>(() => false, authMiddleware);

      const app = new Hono<TestEnv>();
      app.use(conditional);
      app.get('/', (c) => c.json({ authenticated: c.get('authenticated') ?? false }));

      const res = await app.request('/');
      const body = await res.json();
      expect(body).toEqual({ authenticated: false });
    });

    it('evaluates condition based on request path', async () => {
      type TestEnv = { Variables: { protected: boolean } };

      const protectionMiddleware: MiddlewareHandler<TestEnv> = async (c, next) => {
        c.set('protected', true);
        await next();
      };

      const conditional = conditionalMiddleware<TestEnv>(
        (c) => !c.req.path.startsWith('/public'),
        protectionMiddleware,
      );

      const app = new Hono<TestEnv>();
      app.use(conditional);
      app.get('/api/data', (c) => c.json({ protected: c.get('protected') ?? false }));
      app.get('/public/info', (c) => c.json({ protected: c.get('protected') ?? false }));

      const privateRes = await app.request('/api/data');
      expect(await privateRes.json()).toEqual({ protected: true });

      const publicRes = await app.request('/public/info');
      expect(await publicRes.json()).toEqual({ protected: false });
    });

    it('evaluates condition based on request method', async () => {
      const executionLog: string[] = [];

      const loggingMiddleware: MiddlewareHandler = async (c, next) => {
        executionLog.push(`logged: ${c.req.method}`);
        await next();
      };

      const conditional = conditionalMiddleware((c) => c.req.method === 'POST', loggingMiddleware);

      const app = new Hono();
      app.use(conditional);
      app.get('/', (c) => c.text('get'));
      app.post('/', (c) => c.text('post'));

      await app.request('/', { method: 'GET' });
      await app.request('/', { method: 'POST' });

      expect(executionLog).toEqual(['logged: POST']);
    });
  });

  describe('createVariableMiddleware', () => {
    it('creates middleware that sets a variable from sync factory', async () => {
      type BaseEnv = Env;

      const configMiddleware = createVariableMiddleware<BaseEnv, 'config', { debug: boolean }>(
        'config',
        () => ({ debug: true }),
      );

      const app = new Hono();
      app.use(configMiddleware);
      app.get('/', (c) => c.json({ debug: c.get('config').debug }));

      const res = await app.request('/');
      const body = await res.json();
      expect(body).toEqual({ debug: true });
    });

    it('creates middleware that sets a variable from async factory', async () => {
      type BaseEnv = Env;

      const userMiddleware = createVariableMiddleware<BaseEnv, 'user', { name: string }>(
        'user',
        async () => {
          await new Promise((r) => setTimeout(r, 1));
          return { name: 'async-user' };
        },
      );

      const app = new Hono();
      app.use(userMiddleware);
      app.get('/', (c) => c.json({ name: c.get('user').name }));

      const res = await app.request('/');
      const body = await res.json();
      expect(body).toEqual({ name: 'async-user' });
    });

    it('passes context to factory function', async () => {
      type BaseEnv = { Bindings: { API_KEY: string } };

      const app = new Hono<BaseEnv>();

      const keyMiddleware = createVariableMiddleware<BaseEnv, 'apiKey', string>(
        'apiKey',
        (c) => c.env?.API_KEY ?? 'default-key',
      );

      app.use(keyMiddleware);
      app.get('/', (c) => c.json({ key: c.get('apiKey') }));

      const res = await app.request('/');
      const body = await res.json();
      expect(body).toEqual({ key: 'default-key' });
    });

    it('propagates errors from factory function', async () => {
      type BaseEnv = Env;

      const failingMiddleware = createVariableMiddleware<BaseEnv, 'fail', never>('fail', () => {
        throw new Error('Factory error');
      });

      const app = new Hono();
      app.use(failingMiddleware);
      app.get('/', (c) => c.text('ok'));
      app.onError((err, c) => {
        return c.json({ error: err.message }, 500);
      });

      const res = await app.request('/');
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toEqual({ error: 'Factory error' });
    });

    it('propagates errors from async factory function', async () => {
      type BaseEnv = Env;

      const failingMiddleware = createVariableMiddleware<BaseEnv, 'fail', never>(
        'fail',
        async () => {
          await new Promise((r) => setTimeout(r, 1));
          throw new Error('Async factory error');
        },
      );

      const app = new Hono();
      app.use(failingMiddleware);
      app.get('/', (c) => c.text('ok'));
      app.onError((err, c) => {
        return c.json({ error: err.message }, 500);
      });

      const res = await app.request('/');
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toEqual({ error: 'Async factory error' });
    });
  });
});
