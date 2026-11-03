import { OpenAPIHono } from '@hono/zod-openapi';
import { HttpError, type ApiContract } from '@typeful-api/core';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createHonoRouter } from '../../src/adapter';
import { request } from '../setup';

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
            body: z.object({ name: z.string().min(1) }),
            response: Item,
          },
          admin: { method: 'get', path: '/admin/status', response: Item, auth: 'apiKey' },
        },
      },
    },
  },
} as const satisfies ApiContract;

type Handlers = Parameters<typeof createHonoRouter<typeof contract>>[1];

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

const postRaw = (app: OpenAPIHono, body: string, contentType: string) =>
  app.fetch(
    new Request('http://localhost/v1/items', {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
    }),
  );

describe('Problem Details responses', () => {
  it('turns an HttpError thrown by a handler into a problem response', async () => {
    const res = await request(createHonoRouter(contract, handlers()), 'GET', '/v1/items/42');

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    expect(await res.json()).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      code: 'NOT_FOUND',
      detail: 'Item 42 not found',
    });
  });

  it('sends the HttpError headers', async () => {
    const router = createHonoRouter(
      contract,
      handlers({
        get: () => {
          throw new HttpError(429, { headers: { 'Retry-After': '30' } });
        },
      }),
    );

    const res = await request(router, 'GET', '/v1/items/1');

    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('30');
  });

  it('turns an HttpError thrown by group middleware into a problem response', async () => {
    const router = createHonoRouter(contract, {
      v1: {
        items: {
          ...handlers().v1.items,
          middlewares: [
            async () => {
              throw new HttpError(403, 'Maintenance mode');
            },
          ],
        },
      },
    });

    const res = await request(router, 'GET', '/v1/items/1');

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'FORBIDDEN', detail: 'Maintenance mode' });
  });

  it('converts HTTPException without a custom response into a problem', async () => {
    const router = createHonoRouter(
      contract,
      handlers({
        get: () => {
          throw new HTTPException(404, { message: 'Gone fishing' });
        },
      }),
    );

    const res = await request(router, 'GET', '/v1/items/1');

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND', detail: 'Gone fishing' });
  });

  it('keeps the custom response of an HTTPException', async () => {
    const router = createHonoRouter(
      contract,
      handlers({
        get: () => {
          throw new HTTPException(401, { res: new Response('custom', { status: 401 }) });
        },
      }),
    );

    const res = await request(router, 'GET', '/v1/items/1');

    expect(res.status).toBe(401);
    expect(await res.text()).toBe('custom');
  });

  it('leaves other errors to the default error handler', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const router = createHonoRouter(
      contract,
      handlers({
        get: () => {
          throw new Error('boom');
        },
      }),
    );

    const res = await request(router, 'GET', '/v1/items/1');

    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).not.toContain('problem');
    consoleError.mockRestore();
  });

  it('passes other errors to the error handler of the app the router is mounted in', async () => {
    const seen: string[] = [];
    const app = new OpenAPIHono();
    app.onError((error, c) => {
      seen.push(error.message);
      return c.json({ handledBy: 'app' }, 500);
    });
    app.route(
      '/api',
      createHonoRouter(
        contract,
        handlers({
          get: () => {
            throw new Error('boom');
          },
        }),
      ),
    );

    const res = await app.fetch(new Request('http://localhost/api/v1/items/1'));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ handledBy: 'app' });
    expect(seen).toEqual(['boom']);
  });

  it('returns a 400 problem for malformed JSON', async () => {
    const res = await postRaw(
      createHonoRouter(contract, handlers()),
      '{"name":',
      'application/json',
    );

    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    expect(await res.json()).toMatchObject({ status: 400, code: 'BAD_REQUEST' });
  });

  it('returns a 415 problem for an unsupported content type', async () => {
    const res = await postRaw(createHonoRouter(contract, handlers()), 'name=x', 'text/plain');

    expect(res.status).toBe(415);
    expect(await res.json()).toMatchObject({ status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
  });

  it('lets onValidationError replace the 422 response', async () => {
    const router = createHonoRouter(contract, handlers(), {
      onValidationError: (error, c) =>
        c.json({ invalid: error.errors.map((e) => e.path.join('.')), where: error.type }, 400),
    });

    const res = await request(router, 'POST', '/v1/items', { body: { name: '' } });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ invalid: ['name'], where: 'body' });
  });

  it('passes an HttpError thrown by an auth verifier through', async () => {
    const router = createHonoRouter(contract, handlers(), {
      auth: {
        apiKey: () => {
          throw new HttpError(403, 'Key revoked');
        },
      },
    });

    const res = await request(router, 'GET', '/v1/items/admin/status', {
      headers: { 'X-API-Key': 'old' },
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'FORBIDDEN', detail: 'Key revoked' });
  });

  it('documents implicit 401 and 422 problem responses', async () => {
    const res = await request(createHonoRouter(contract, handlers()), 'GET', '/api-doc');
    const spec = await res.json();

    const create = spec.paths['/v1/items']?.post?.responses;
    const admin = spec.paths['/v1/items/admin/status']?.get?.responses;
    expect(create?.['422']?.description).toBe('Unprocessable Content');
    expect(create?.['422']?.content?.['application/problem+json']).toBeDefined();
    expect(admin?.['401']?.content?.['application/problem+json']).toBeDefined();
  });

  it('records the contract position of every operation for generated clients', async () => {
    const spec = await (
      await request(createHonoRouter(contract, handlers()), 'GET', '/api-doc')
    ).json();

    expect(spec.paths['/v1/items/{id}'].get['x-typeful-route']).toEqual(['v1', 'items', 'get']);
    expect(spec.paths['/v1/items'].post['x-typeful-route']).toEqual(['v1', 'items', 'create']);
  });
});
