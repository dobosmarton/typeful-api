import { HttpError, type ApiContract } from '@typeful-api/core';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createFastifyPlugin } from '../../src/adapter';
import type { CreateFastifyPluginOptions, InferFastifyHandlers } from '../../src/types';

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

type Handlers = InferFastifyHandlers<typeof contract>;

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

describe('Problem Details responses', () => {
  let fastify: FastifyInstance | undefined;

  afterEach(async () => {
    await fastify?.close();
    fastify = undefined;
  });

  const start = async (
    routeHandlers: Handlers = handlers(),
    options: CreateFastifyPluginOptions = {},
  ) => {
    fastify = Fastify();
    fastify.register(createFastifyPlugin(contract, routeHandlers, options));
    await fastify.ready();
    return fastify;
  };

  const postJson = async (
    app: FastifyInstance,
    payload: string,
    contentType = 'application/json',
  ) =>
    app.inject({
      method: 'POST',
      url: '/v1/items',
      payload,
      headers: { 'content-type': contentType },
    });

  it('turns an HttpError thrown by a handler into a problem response', async () => {
    const res = await (await start()).inject({ method: 'GET', url: '/v1/items/42' });

    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.json()).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      code: 'NOT_FOUND',
      detail: 'Item 42 not found',
    });
  });

  it('sends the HttpError headers', async () => {
    const app = await start(
      handlers({
        get: () => {
          throw new HttpError(429, { headers: { 'Retry-After': '30' } });
        },
      }),
    );

    const res = await app.inject({ method: 'GET', url: '/v1/items/1' });

    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('30');
  });

  it('turns an HttpError thrown by a group preHandler into a problem response', async () => {
    const app = await start({
      v1: {
        items: {
          ...handlers().v1.items,
          preHandler: async () => {
            throw new HttpError(403, 'Maintenance mode');
          },
        },
      },
    });

    const res = await app.inject({ method: 'GET', url: '/v1/items/1' });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'FORBIDDEN', detail: 'Maintenance mode' });
  });

  it('does not call the errorHandler option for HttpErrors', async () => {
    const errorHandler = vi.fn();
    const app = await start(handlers(), { errorHandler });

    const res = await app.inject({ method: 'GET', url: '/v1/items/1' });

    expect(res.statusCode).toBe(404);
    expect(errorHandler).not.toHaveBeenCalled();
  });

  it('passes other errors to the parent error handler when there is no errorHandler', async () => {
    fastify = Fastify();
    fastify.setErrorHandler((error, _request, reply) =>
      reply.code(500).send({ handledBy: 'parent', message: error.message }),
    );
    fastify.register(
      createFastifyPlugin(
        contract,
        handlers({
          get: () => {
            throw new Error('boom');
          },
        }),
      ),
    );
    await fastify.ready();

    const res = await fastify.inject({ method: 'GET', url: '/v1/items/1' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ handledBy: 'parent', message: 'boom' });
  });

  it('returns a 400 problem for malformed JSON', async () => {
    const res = await postJson(await start(), '{"name":');

    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.json()).toMatchObject({
      status: 400,
      code: 'BAD_REQUEST',
      detail: 'Malformed JSON in request body',
    });
  });

  it('returns a 415 problem for an unsupported content type', async () => {
    const res = await postJson(await start(), 'name=x', 'application/x-www-form-urlencoded');

    expect(res.statusCode).toBe(415);
    expect(res.json()).toMatchObject({ status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
  });

  it('runs async refinements and reports them as 422 problems', async () => {
    const app = await start();

    const ok = await postJson(app, JSON.stringify({ name: 'free' }));
    const taken = await postJson(app, JSON.stringify({ name: 'taken' }));

    expect(ok.statusCode).toBe(200);
    expect(taken.statusCode).toBe(422);
    expect(taken.json()).toMatchObject({
      errors: [{ location: 'body', path: ['name'], message: 'Name is taken' }],
    });
  });

  it('lets onValidationError replace the 422 response', async () => {
    const app = await start(handlers(), {
      onValidationError: async (error, _request, reply) => {
        await reply.code(400).send({ code: error.problem.code, where: error.type });
      },
    });

    const res = await postJson(app, JSON.stringify({ name: 1 }));

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ code: 'VALIDATION_FAILED', where: 'body' });
  });

  it('still sends the 422 problem when onValidationError does not reply', async () => {
    const seen: string[] = [];
    const app = await start(handlers(), {
      onValidationError: (error) => {
        seen.push(error.type);
      },
    });

    const res = await postJson(app, JSON.stringify({ name: 1 }));

    expect(res.statusCode).toBe(422);
    expect(seen).toEqual(['body']);
  });

  it('passes an HttpError thrown by an auth verifier through', async () => {
    const app = await start(handlers(), {
      auth: {
        apiKey: () => {
          throw new HttpError(403, 'Key revoked');
        },
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/items/admin/status',
      headers: { 'x-api-key': 'old' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'FORBIDDEN', detail: 'Key revoked' });
  });

  it('mounts routes and docs under the prefix option', async () => {
    const app = await start(handlers(), { prefix: '/api/' });

    const item = await app.inject({ method: 'GET', url: '/api/v1/items/7' });
    const docs = await app.inject({ method: 'GET', url: '/api/api-doc' });
    const unprefixed = await app.inject({ method: 'GET', url: '/v1/items/7' });

    expect(item.statusCode).toBe(404);
    expect(item.json()).toMatchObject({ detail: 'Item 7 not found' });
    expect(docs.statusCode).toBe(200);
    expect(unprefixed.statusCode).toBe(404);
    expect(unprefixed.headers['content-type']).not.toMatch(/problem/);
  });

  it('documents implicit 401 and 422 problem responses', async () => {
    const spec = (await (await start()).inject({ method: 'GET', url: '/api-doc' })).json();

    expect(spec.paths['/v1/items'].post.responses['422'].content).toHaveProperty(
      'application/problem+json',
    );
    expect(spec.paths['/v1/items/admin/status'].get.responses['401'].content).toHaveProperty(
      'application/problem+json',
    );
  });
});
