import { HttpError, type ApiContract } from '@typeful-api/core';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createExpressRouter, problemErrorHandler } from '../../src/adapter';
import type { InferExpressHandlers } from '../../src/types';

const Item = z.object({ id: z.string(), name: z.string() });

const contract = {
  v1: {
    children: {
      items: {
        routes: {
          get: {
            method: 'get',
            path: '/:id',
            params: z.object({ id: z.string() }),
            response: Item,
          },
          create: {
            method: 'post',
            path: '/',
            body: z.object({
              name: z.string().refine(async (name) => name !== 'taken', 'Name is taken'),
            }),
            response: Item,
          },
          admin: { method: 'get', path: '/admin/status', response: Item, auth: 'apiKey' },
        },
      },
    },
  },
} as const satisfies ApiContract;

type Handlers = InferExpressHandlers<typeof contract>;

const handlers = (overrides: Partial<Handlers['v1']['items']> = {}): Handlers => ({
  v1: {
    items: {
      get: ({ params }) => {
        throw new HttpError(404, `Item ${params.id} not found`);
      },
      create: ({ body }) => ({ id: '1', name: body.name }),
      admin: () => ({ id: 'a', name: 'Admin' }),
      ...overrides,
    },
  },
});

const send = async (
  app: express.Express,
  path: string,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {},
): Promise<Response> => {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await fetch(`http://127.0.0.1:${port}${path}`, init);
  } finally {
    server.close();
  }
};

const json = (body: unknown) => ({
  method: 'POST',
  body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json' },
});

const appWith = (router: express.Router, ...after: ErrorRequestHandler[]) => {
  const app = express();
  app.use(express.json());
  app.use(router);
  for (const handler of after) app.use(handler);
  return app;
};

describe('Problem Details responses', () => {
  it('turns an HttpError thrown by a handler into a problem response', async () => {
    const res = await send(appWith(createExpressRouter(contract, handlers())), '/v1/items/42');

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/^application\/problem\+json/);
    expect(await res.json()).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      code: 'NOT_FOUND',
      detail: 'Item 42 not found',
    });
  });

  it('sends the HttpError headers', async () => {
    const router = createExpressRouter(
      contract,
      handlers({
        get: () => {
          throw new HttpError(429, { headers: { 'Retry-After': '30' } });
        },
      }),
    );

    const res = await send(appWith(router), '/v1/items/1');

    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('30');
  });

  it('turns an HttpError passed by group middleware into a problem response', async () => {
    const router = createExpressRouter(contract, {
      v1: {
        items: {
          ...handlers().v1.items,
          middleware: [(_req, _res, next) => next(new HttpError(403, 'Maintenance mode'))],
        },
      },
    });

    const res = await send(appWith(router), '/v1/items/1');

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'FORBIDDEN', detail: 'Maintenance mode' });
  });

  it('passes other errors on to the app error handler', async () => {
    const router = createExpressRouter(
      contract,
      handlers({
        get: () => {
          throw new Error('boom');
        },
      }),
    );
    const appHandler: ErrorRequestHandler = (error, _req, res, _next) => {
      res.status(500).json({ handledBy: 'app', message: error.message });
    };

    const res = await send(appWith(router, problemErrorHandler(), appHandler), '/v1/items/1');

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ handledBy: 'app', message: 'boom' });
  });

  it('runs async refinements and reports them as 422 problems', async () => {
    const router = createExpressRouter(contract, handlers());

    const ok = await send(appWith(router), '/v1/items', json({ name: 'free' }));
    const taken = await send(appWith(router), '/v1/items', json({ name: 'taken' }));

    expect(ok.status).toBe(200);
    expect(taken.status).toBe(422);
    expect(await taken.json()).toMatchObject({
      errors: [{ location: 'body', path: ['name'], message: 'Name is taken' }],
    });
  });

  it('passes the problem to onValidationError', async () => {
    const router = createExpressRouter(contract, handlers(), {
      onValidationError: (error, _req, res) => {
        res.status(400).json({ code: error.problem.code, where: error.type });
      },
    });

    const res = await send(appWith(router), '/v1/items', json({ name: 1 }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: 'VALIDATION_FAILED', where: 'body' });
  });

  it('passes an HttpError thrown by an auth verifier through', async () => {
    const router = createExpressRouter(contract, handlers(), {
      auth: {
        apiKey: () => {
          throw new HttpError(403, 'Key revoked');
        },
      },
    });

    const res = await send(appWith(router), '/v1/items/admin/status', {
      headers: { 'X-API-Key': 'old' },
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'FORBIDDEN', detail: 'Key revoked' });
  });

  it('documents implicit 401 and 422 problem responses', async () => {
    const res = await send(appWith(createExpressRouter(contract, handlers())), '/api-doc');
    const spec = await res.json();

    expect(spec.paths['/v1/items'].post.responses['422'].content).toHaveProperty(
      'application/problem+json',
    );
    expect(spec.paths['/v1/items/admin/status'].get.responses['401'].content).toHaveProperty(
      'application/problem+json',
    );
  });
});

describe('problemErrorHandler', () => {
  const router = () => createExpressRouter(contract, handlers());

  it('turns malformed JSON from express.json() into a 400 problem', async () => {
    const res = await send(appWith(router(), problemErrorHandler()), '/v1/items', {
      method: 'POST',
      body: '{"name":',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      status: 400,
      code: 'BAD_REQUEST',
      detail: 'Malformed JSON in request body',
    });
  });

  it('turns a too large body into a 413 problem', async () => {
    const app = express();
    app.use(express.json({ limit: '10b' }));
    app.use(router());
    app.use(problemErrorHandler());

    const res = await send(app, '/v1/items', json({ name: 'a much longer name' }));

    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ status: 413, code: 'CONTENT_TOO_LARGE' });
  });

  it('handles HttpErrors from app-level middleware', async () => {
    const app = express();
    app.use((_req, _res, next) => next(new HttpError(503, 'Down for maintenance')));
    app.use(router());
    app.use(problemErrorHandler());

    const res = await send(app, '/v1/items/1');

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
});
