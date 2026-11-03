import { HttpError, defineApi, paginated, paginationQuery, route } from '@typeful-api/core';
import { UnexpectedResponseError, createClient, unwrap } from '@typeful-api/core/client';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createExpressRouter, problemErrorHandler } from '../../src/adapter';

const Product = z.object({ id: z.string(), name: z.string(), price: z.number() });

const api = defineApi({
  v1: {
    routes: { health: route.get('/health').returns(z.object({ ok: z.boolean() })) },
    children: {
      products: {
        routes: {
          list: route.get('/').query(paginationQuery()).returns(paginated(Product)),
          get: route
            .get('/:id')
            .params(z.object({ id: z.string() }))
            .returns(Product)
            .withErrors(404),
          create: route
            .post('/')
            .body(z.object({ name: z.string().min(1), price: z.number().positive() }))
            .returns(Product)
            .withAuth('bearer'),
          crash: route.get('/admin/crash').returns(Product),
        },
        children: {
          reviews: {
            routes: {
              list: route
                .get('/:id/reviews')
                .params(z.object({ id: z.string() }))
                .returns(z.array(z.string())),
            },
          },
        },
      },
    },
  },
});

const router = createExpressRouter(
  api,
  {
    v1: {
      health: () => ({ ok: true }),
      products: {
        list: ({ query }) => ({
          items: [],
          total: 0,
          page: query.page,
          limit: query.limit,
          totalPages: 0,
        }),
        get: ({ params }) => {
          if (params.id === 'missing') throw new HttpError(404, 'Product missing not found');
          return { id: params.id, name: 'Pen', price: 2 };
        },
        create: ({ body }) => ({ id: 'new', ...body }),
        crash: () => {
          throw new Error('boom');
        },
        reviews: { list: ({ params }) => [`review of ${params.id}`] },
      },
    },
  },
  {
    auth: {
      bearer: ({ token }) => {
        if (token !== 'secret') throw new Error('bad token');
        return { id: 'u1' };
      },
    },
  },
);

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  app.use(problemErrorHandler());
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('typed client against the Express adapter', () => {
  const client = () => createClient(api, { baseUrl });

  it('calls version-level and nested routes', async () => {
    expect(await client().v1.health().then(unwrap)).toEqual({ ok: true });
    expect(
      await client()
        .v1.products.reviews.list({ params: { id: '7' } })
        .then(unwrap),
    ).toEqual(['review of 7']);
  });

  it('sends query parameters and lets the server apply defaults', async () => {
    expect(await client().v1.products.list().then(unwrap)).toMatchObject({ page: 1, limit: 20 });
    expect(
      await client()
        .v1.products.list({ query: { page: 3 } })
        .then(unwrap),
    ).toMatchObject({
      page: 3,
    });
  });

  it('narrows declared error responses', async () => {
    const res = await client().v1.products.get({ params: { id: 'missing' } });

    expect(res.status).toBe(404);
    if (res.status === 404) {
      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.detail).toBe('Product missing not found');
    }
  });

  it('returns the 422 problem for invalid input', async () => {
    const res = await client().v1.products.list({ query: { limit: 500 } });

    expect(res.status).toBe(422);
    if (res.status === 422) expect(res.body.errors?.[0]).toMatchObject({ location: 'query' });
  });

  it('returns 401 without credentials and succeeds with dynamic auth headers', async () => {
    const anonymous = await client().v1.products.create({ body: { name: 'Pen', price: 2 } });
    const authed = createClient(api, {
      baseUrl,
      headers: async () => ({ Authorization: 'Bearer secret' }),
    });

    expect(anonymous.status).toBe(401);
    expect(
      await authed.v1.products.create({ body: { name: 'Pen', price: 2 } }).then(unwrap),
    ).toEqual({ id: 'new', name: 'Pen', price: 2 });
  });

  it('throws UnexpectedResponseError for an unhandled server error', async () => {
    await expect(client().v1.products.crash()).rejects.toBeInstanceOf(UnexpectedResponseError);
  });

  it('validates responses when asked to', async () => {
    const validating = createClient(api, { baseUrl, validateResponse: true });

    expect(await validating.v1.products.get({ params: { id: '1' } }).then(unwrap)).toEqual({
      id: '1',
      name: 'Pen',
      price: 2,
    });
  });
});
