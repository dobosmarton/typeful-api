import type { ApiContract } from '@typeful-api/core';
import express from 'express';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createExpressRouter } from '../../src/adapter';

const HealthSchema = z.object({ status: z.string() });

const authContract = {
  v1: {
    children: {
      protected: {
        routes: {
          bearerRoute: {
            method: 'get',
            path: '/bearer',
            response: HealthSchema,
            auth: 'bearer',
          },
          apiKeyRoute: {
            method: 'get',
            path: '/api-key',
            response: HealthSchema,
            auth: 'apiKey',
          },
          basicRoute: {
            method: 'get',
            path: '/basic',
            response: HealthSchema,
            auth: 'basic',
          },
          publicRoute: {
            method: 'get',
            path: '/public',
            response: HealthSchema,
            auth: 'none',
          },
          noAuthRoute: {
            method: 'get',
            path: '/no-auth',
            response: HealthSchema,
          },
        },
      },
    },
  },
} as const satisfies ApiContract;

const request = async (
  app: express.Express,
  path: string,
  headers?: Record<string, string>,
): Promise<Response> => {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    headers,
  });
  server.close();
  return res;
};

describe('auth enforcement', () => {
  const createApp = () => {
    const router = createExpressRouter(
      authContract,
      {
        v1: {
          protected: {
            bearerRoute: () => ({ status: 'bearer-ok' }),
            apiKeyRoute: () => ({ status: 'apikey-ok' }),
            basicRoute: () => ({ status: 'basic-ok' }),
            publicRoute: () => ({ status: 'public-ok' }),
            noAuthRoute: () => ({ status: 'noauth-ok' }),
          },
        },
      },
      {
        auth: {
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
        },
      },
    );

    const app = express();
    app.use(express.json());
    app.use(router);
    return app;
  };

  describe('bearer auth', () => {
    it('allows valid bearer token', async () => {
      const app = createApp();
      const res = await request(app, '/v1/protected/bearer', {
        Authorization: 'Bearer valid-token',
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('bearer-ok');
    });

    it('rejects missing bearer token', async () => {
      const app = createApp();
      const res = await request(app, '/v1/protected/bearer');
      expect(res.status).toBe(401);
    });

    it('rejects invalid bearer token', async () => {
      const app = createApp();
      const res = await request(app, '/v1/protected/bearer', {
        Authorization: 'Bearer invalid-token',
      });
      expect(res.status).toBe(401);
    });
  });

  describe('apiKey auth', () => {
    it('allows valid API key', async () => {
      const app = createApp();
      const res = await request(app, '/v1/protected/api-key', {
        'X-API-Key': 'valid-key',
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('apikey-ok');
    });

    it('rejects missing API key', async () => {
      const app = createApp();
      const res = await request(app, '/v1/protected/api-key');
      expect(res.status).toBe(401);
    });
  });

  describe('basic auth', () => {
    it('allows valid basic credentials', async () => {
      const app = createApp();
      const res = await request(app, '/v1/protected/basic', {
        Authorization: `Basic ${btoa('admin:secret')}`,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('basic-ok');
    });

    it('rejects invalid basic credentials', async () => {
      const app = createApp();
      const res = await request(app, '/v1/protected/basic', {
        Authorization: `Basic ${btoa('admin:wrong')}`,
      });
      expect(res.status).toBe(401);
    });
  });

  describe('auth skipping', () => {
    it('skips auth for routes with auth: none', async () => {
      const app = createApp();
      const res = await request(app, '/v1/protected/public');
      expect(res.status).toBe(200);
    });

    it('skips auth for routes without auth config', async () => {
      const app = createApp();
      const res = await request(app, '/v1/protected/no-auth');
      expect(res.status).toBe(200);
    });
  });
});
