import type { ApiContract, AuthConfig } from '@typeful-api/core';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createHonoRouter } from '../../src/adapter';
import { request } from '../setup';

const HealthSchema = z.object({ status: z.string() });

const authContract = {
  v1: {
    children: {
      protected: {
        routes: {
          bearerRoute: { method: 'get', path: '/bearer', response: HealthSchema, auth: 'bearer' },
          apiKeyRoute: { method: 'get', path: '/api-key', response: HealthSchema, auth: 'apiKey' },
          basicRoute: { method: 'get', path: '/basic', response: HealthSchema, auth: 'basic' },
          publicRoute: { method: 'get', path: '/public', response: HealthSchema, auth: 'none' },
          noAuthRoute: { method: 'get', path: '/no-auth', response: HealthSchema },
          // Same path, different methods: only POST is protected
          listItems: { method: 'get', path: '/items', response: HealthSchema },
          createItem: { method: 'post', path: '/items', response: HealthSchema, auth: 'bearer' },
        },
      },
    },
  },
} as const satisfies ApiContract;

type User = { id: string; role: string };

const createAuthConfig = (overrides: Partial<AuthConfig<User>> = {}): AuthConfig<User> => ({
  bearer: async ({ token }) => {
    if (token === 'valid-token') return { id: '1', role: 'admin' };
    throw new Error('Invalid token');
  },
  apiKey: async ({ key }) => {
    if (key === 'valid-key') return { id: '2', role: 'service' };
    throw new Error('Invalid key');
  },
  basic: async ({ username, password }) => {
    if (username === 'admin' && password === 'secret') return { id: '3', role: 'admin' };
    throw new Error('Invalid credentials');
  },
  ...overrides,
});

const createRouter = (auth: AuthConfig<User> = createAuthConfig()) =>
  createHonoRouter(
    authContract,
    {
      v1: {
        protected: {
          bearerRoute: ({ c }) => ({ status: `bearer-ok:${(c.get('authUser') as User).id}` }),
          apiKeyRoute: ({ c }) => ({ status: `apikey-ok:${(c.get('authUser') as User).id}` }),
          basicRoute: ({ c }) => ({ status: `basic-ok:${(c.get('authUser') as User).id}` }),
          publicRoute: () => ({ status: 'public-ok' }),
          noAuthRoute: () => ({ status: 'noauth-ok' }),
          listItems: () => ({ status: 'list-ok' }),
          createItem: () => ({ status: 'create-ok' }),
        },
      },
    },
    { auth, registerDocs: false },
  );

describe('auth enforcement', () => {
  describe('bearer auth', () => {
    it('allows a valid bearer token and exposes the user to the handler', async () => {
      const res = await request(createRouter(), 'GET', '/v1/protected/bearer', {
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'bearer-ok:1' });
    });

    it('rejects a missing bearer token', async () => {
      const res = await request(createRouter(), 'GET', '/v1/protected/bearer');
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ code: 'UNAUTHORIZED', message: 'Missing credentials' });
    });

    it('rejects an invalid bearer token', async () => {
      const res = await request(createRouter(), 'GET', '/v1/protected/bearer', {
        headers: { Authorization: 'Bearer invalid-token' },
      });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ code: 'UNAUTHORIZED', message: 'Authentication failed' });
    });
  });

  describe('apiKey auth', () => {
    it('allows a valid API key and exposes the user to the handler', async () => {
      const res = await request(createRouter(), 'GET', '/v1/protected/api-key', {
        headers: { 'X-API-Key': 'valid-key' },
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'apikey-ok:2' });
    });

    it('rejects a missing API key', async () => {
      const res = await request(createRouter(), 'GET', '/v1/protected/api-key');
      expect(res.status).toBe(401);
    });
  });

  describe('basic auth', () => {
    it('allows valid basic credentials and exposes the user to the handler', async () => {
      const res = await request(createRouter(), 'GET', '/v1/protected/basic', {
        headers: { Authorization: `Basic ${btoa('admin:secret')}` },
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'basic-ok:3' });
    });

    it('rejects invalid basic credentials', async () => {
      const res = await request(createRouter(), 'GET', '/v1/protected/basic', {
        headers: { Authorization: `Basic ${btoa('admin:wrong')}` },
      });
      expect(res.status).toBe(401);
    });

    it('rejects a missing basic auth header', async () => {
      const res = await request(createRouter(), 'GET', '/v1/protected/basic');
      expect(res.status).toBe(401);
    });
  });

  describe('auth skipping', () => {
    it('skips auth for routes with auth: none', async () => {
      const res = await request(createRouter(), 'GET', '/v1/protected/public');
      expect(res.status).toBe(200);
    });

    it('skips auth for routes without auth config', async () => {
      const res = await request(createRouter(), 'GET', '/v1/protected/no-auth');
      expect(res.status).toBe(200);
    });

    it('only protects the method that declares auth when routes share a path', async () => {
      const router = createRouter();

      const list = await request(router, 'GET', '/v1/protected/items');
      expect(list.status).toBe(200);
      expect(await list.json()).toEqual({ status: 'list-ok' });

      const createDenied = await request(router, 'POST', '/v1/protected/items');
      expect(createDenied.status).toBe(401);

      const createAllowed = await request(router, 'POST', '/v1/protected/items', {
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(createAllowed.status).toBe(200);
    });

    it('does not leak auth to a public route declared after a protected route on the same path', async () => {
      // Hono runs matching middleware in registration order, so declaration order must not matter
      const protectedFirstContract = {
        v1: {
          children: {
            items: {
              routes: {
                create: { method: 'post', path: '/', response: HealthSchema, auth: 'bearer' },
                list: { method: 'get', path: '/', response: HealthSchema },
              },
            },
          },
        },
      } as const satisfies ApiContract;

      const router = createHonoRouter(
        protectedFirstContract,
        {
          v1: {
            items: {
              create: () => ({ status: 'create-ok' }),
              list: () => ({ status: 'list-ok' }),
            },
          },
        },
        { auth: createAuthConfig(), registerDocs: false },
      );

      const list = await request(router, 'GET', '/v1/items');
      expect(list.status).toBe(200);
      expect(await list.json()).toEqual({ status: 'list-ok' });

      const createDenied = await request(router, 'POST', '/v1/items');
      expect(createDenied.status).toBe(401);
    });
  });

  describe('onError', () => {
    it('is called with the error and auth type when verification fails', async () => {
      const onError = vi.fn();
      const res = await request(
        createRouter(createAuthConfig({ onError })),
        'GET',
        '/v1/protected/bearer',
        {
          headers: { Authorization: 'Bearer invalid-token' },
        },
      );
      expect(res.status).toBe(401);
      expect(onError).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledWith(new Error('Invalid token'), 'bearer');
    });
  });
});
