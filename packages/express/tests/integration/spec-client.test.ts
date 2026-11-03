import { generateClient } from '@typeful-api/cli';
import { HttpError, defineApi, paginated, paginationQuery, route } from '@typeful-api/core';
import { UnexpectedResponseError, unwrap } from '@typeful-api/core/client';
import express from 'express';
import fs from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createExpressRouter, problemErrorHandler } from '../../src/adapter';

/**
 * A service in another repository only sees this API's /api-doc. These tests fetch the document
 * over HTTP the way the CLI does for another service, generate a client and call the server.
 */
const Order = z.object({ id: z.string(), total: z.number() });

const api = defineApi({
  v1: {
    children: {
      orders: {
        routes: {
          list: route.get('/').query(paginationQuery()).returns(paginated(Order)),
          get: route
            .get('/:id')
            .params(z.object({ id: z.string() }))
            .returns(Order)
            .withErrors(404),
          create: route
            .post('/')
            .body(z.object({ total: z.number().positive() }))
            .returns(Order)
            .withAuth('bearer'),
          crash: route.get('/admin/crash').returns(Order),
        },
      },
    },
  },
});

const router = createExpressRouter(
  api,
  {
    v1: {
      orders: {
        list: ({ query }) => ({
          items: [],
          total: 0,
          page: query.page,
          limit: query.limit,
          totalPages: 0,
        }),
        get: ({ params }) => {
          if (params.id === 'missing') throw new HttpError(404, 'Order missing not found');
          return { id: params.id, total: 10 };
        },
        create: ({ body }) => ({ id: 'new', total: body.total }),
        crash: () => {
          throw new Error('boom');
        },
      },
    },
  },
  {
    auth: {
      bearer: ({ token }) => {
        if (token !== 'secret') throw new Error('bad token');
        return { id: 'service-a' };
      },
    },
  },
);

const generatedDir = fileURLToPath(new URL('../.generated/', import.meta.url));
const out = path.join(generatedDir, 'orders-client.ts');

type GeneratedModule = {
  createApiClient: (options: {
    baseUrl: string;
    headers?: () => Promise<Record<string, string>>;
  }) => {
    v1: {
      orders: Record<
        'list' | 'get' | 'create' | 'crash',
        (args?: object) => Promise<{ status: number; body: Record<string, unknown> }>
      >;
    };
  };
};

let server: Server;
let baseUrl: string;
let generated: GeneratedModule;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  app.use(problemErrorHandler());
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

  fs.rmSync(generatedDir, { recursive: true, force: true });
  await generateClient({ spec: `${baseUrl}/api-doc`, out });
  generated = (await import(out)) as GeneratedModule;
});

afterAll(async () => {
  fs.rmSync(generatedDir, { recursive: true, force: true });
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('client generated from the Express /api-doc URL', () => {
  const client = () => generated.createApiClient({ baseUrl });

  it('calls routes and lets the server apply query defaults', async () => {
    expect(
      await client()
        .v1.orders.get({ params: { id: '7' } })
        .then(unwrap),
    ).toEqual({
      id: '7',
      total: 10,
    });
    expect(await client().v1.orders.list().then(unwrap)).toMatchObject({ page: 1, limit: 20 });
  });

  it('returns documented problems', async () => {
    const missing = await client().v1.orders.get({ params: { id: 'missing' } });
    const invalid = await client().v1.orders.list({ query: { limit: 500 } });
    const anonymous = await client().v1.orders.create({ body: { total: 5 } });

    expect(missing).toMatchObject({ status: 404, body: { code: 'NOT_FOUND' } });
    expect(invalid).toMatchObject({ status: 422, body: { code: 'VALIDATION_FAILED' } });
    expect(anonymous).toMatchObject({ status: 401, body: { code: 'UNAUTHORIZED' } });
  });

  it('sends auth headers from the client options', async () => {
    const authed = generated.createApiClient({
      baseUrl,
      headers: async () => ({ Authorization: 'Bearer secret' }),
    });

    expect(await authed.v1.orders.create({ body: { total: 5 } }).then(unwrap)).toEqual({
      id: 'new',
      total: 5,
    });
  });

  it('throws UnexpectedResponseError for undocumented statuses', async () => {
    await expect(client().v1.orders.crash()).rejects.toBeInstanceOf(UnexpectedResponseError);
  });
});
