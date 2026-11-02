import type { ApiContract, AuthConfig } from '@typeful-api/core';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createFastifyPlugin } from '../../src/adapter';
import { getLocals } from '../../src/helpers';

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
          // Same path, different methods, protected route declared first
          createItem: { method: 'post', path: '/items', response: HealthSchema, auth: 'bearer' },
          listItems: { method: 'get', path: '/items', response: HealthSchema },
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

describe('auth enforcement', () => {
  let fastify: FastifyInstance;

  afterEach(async () => {
    await fastify?.close();
  });

  const createApp = async (auth: AuthConfig<User> = createAuthConfig()) => {
    const userId = (request: Parameters<typeof getLocals>[0]) =>
      getLocals<{ authUser: User }>(request).authUser.id;

    const plugin = createFastifyPlugin(
      authContract,
      {
        v1: {
          protected: {
            bearerRoute: ({ request }) => ({ status: `bearer-ok:${userId(request)}` }),
            apiKeyRoute: ({ request }) => ({ status: `apikey-ok:${userId(request)}` }),
            basicRoute: ({ request }) => ({ status: `basic-ok:${userId(request)}` }),
            publicRoute: () => ({ status: 'public-ok' }),
            noAuthRoute: () => ({ status: 'noauth-ok' }),
            createItem: () => ({ status: 'create-ok' }),
            listItems: () => ({ status: 'list-ok' }),
          },
        },
      },
      { auth },
    );

    fastify = Fastify();
    fastify.register(plugin);
    await fastify.ready();
    return fastify;
  };

  const get = async (url: string, headers?: Record<string, string>) => {
    const app = await createApp();
    return app.inject({ method: 'GET', url, headers });
  };

  describe('bearer auth', () => {
    it('allows a valid bearer token and exposes the user to the handler', async () => {
      const res = await get('/v1/protected/bearer', { authorization: 'Bearer valid-token' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'bearer-ok:1' });
    });

    it('rejects a missing bearer token', async () => {
      const res = await get('/v1/protected/bearer');
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ code: 'UNAUTHORIZED', message: 'Missing credentials' });
    });

    it('rejects an invalid bearer token', async () => {
      const res = await get('/v1/protected/bearer', { authorization: 'Bearer invalid-token' });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ code: 'UNAUTHORIZED', message: 'Authentication failed' });
    });
  });

  describe('apiKey auth', () => {
    it('allows a valid API key and exposes the user to the handler', async () => {
      const res = await get('/v1/protected/api-key', { 'x-api-key': 'valid-key' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'apikey-ok:2' });
    });

    it('rejects a missing API key', async () => {
      const res = await get('/v1/protected/api-key');
      expect(res.statusCode).toBe(401);
    });
  });

  describe('basic auth', () => {
    it('allows valid basic credentials and exposes the user to the handler', async () => {
      const res = await get('/v1/protected/basic', {
        authorization: `Basic ${btoa('admin:secret')}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'basic-ok:3' });
    });

    it('rejects invalid basic credentials', async () => {
      const res = await get('/v1/protected/basic', {
        authorization: `Basic ${btoa('admin:wrong')}`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects a missing basic auth header', async () => {
      const res = await get('/v1/protected/basic');
      expect(res.statusCode).toBe(401);
    });
  });

  describe('auth skipping', () => {
    it('skips auth for routes with auth: none', async () => {
      const res = await get('/v1/protected/public');
      expect(res.statusCode).toBe(200);
    });

    it('skips auth for routes without auth config', async () => {
      const res = await get('/v1/protected/no-auth');
      expect(res.statusCode).toBe(200);
    });

    it('only protects the method that declares auth when routes share a path', async () => {
      const app = await createApp();

      const list = await app.inject({ method: 'GET', url: '/v1/protected/items' });
      expect(list.statusCode).toBe(200);
      expect(list.json()).toEqual({ status: 'list-ok' });

      const createDenied = await app.inject({ method: 'POST', url: '/v1/protected/items' });
      expect(createDenied.statusCode).toBe(401);

      const createAllowed = await app.inject({
        method: 'POST',
        url: '/v1/protected/items',
        headers: { authorization: 'Bearer valid-token' },
      });
      expect(createAllowed.statusCode).toBe(200);
    });
  });

  describe('onError', () => {
    it('is called with the error and auth type when verification fails', async () => {
      const onError = vi.fn();
      const app = await createApp(createAuthConfig({ onError }));
      const res = await app.inject({
        method: 'GET',
        url: '/v1/protected/bearer',
        headers: { authorization: 'Bearer invalid-token' },
      });
      expect(res.statusCode).toBe(401);
      expect(onError).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledWith(new Error('Invalid token'), 'bearer');
    });
  });
});
