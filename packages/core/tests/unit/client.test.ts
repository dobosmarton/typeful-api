import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  ResponseError,
  ResponseValidationError,
  UnexpectedResponseError,
  createClient,
  isResponseError,
  unwrap,
} from '../../src/client';
import { defineApi } from '../../src/contract';
import { problemSchema } from '../../src/helpers/problem';
import { route } from '../../src/route';

const Product = z.object({ id: z.string(), name: z.string() });

const api = defineApi({
  v1: {
    routes: {
      health: route.get('/health').returns(z.object({ ok: z.boolean() })),
    },
    children: {
      products: {
        routes: {
          list: route
            .get('/')
            .query(z.object({ page: z.number().optional(), tag: z.array(z.string()).optional() }))
            .returns(z.array(Product)),
          get: route
            .get('/:id')
            .params(z.object({ id: z.string() }))
            .returns(Product)
            .withErrors(404),
          create: route
            .post('/')
            .body(z.object({ name: z.string() }))
            .returns(Product)
            .withAuth('bearer')
            .withResponses({ 409: problemSchema(409, 'DUPLICATE') }),
          remove: route
            .delete('/:id')
            .params(z.object({ id: z.string() }))
            .returns(Product),
          dated: route
            .get('/dated')
            .returns(z.object({ at: z.iso.datetime().transform((value) => new Date(value)) })),
        },
        children: {
          reviews: { routes: { list: route.get('/:id/reviews').returns(z.array(z.string())) } },
        },
      },
    },
  },
});

const json = (body: unknown, status = 200, contentType = 'application/json') =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': contentType } });

const mockFetch = (response: Response | (() => Response) = json({ ok: true })) =>
  vi.fn(async (_url: string, _init: RequestInit) =>
    typeof response === 'function' ? response() : response.clone(),
  );

const setup = (response?: Response, options: Partial<Parameters<typeof createClient>[1]> = {}) => {
  const fetch = mockFetch(response);
  const client = createClient(api, { baseUrl: 'https://api.test/', fetch, ...options });
  const call = () => {
    const [url, init] = fetch.mock.calls[0] ?? [];
    return { url, init: init as RequestInit, headers: new Headers(init?.headers) };
  };
  return { client, fetch, call };
};

describe('createClient', () => {
  describe('requests', () => {
    it('builds the URL from the base URL, version, groups and route path', async () => {
      const { client, call } = setup(json([]));

      await client.v1.products.reviews.list({ params: { id: '7' } } as never);
      expect(call().url).toBe('https://api.test/v1/products/reviews/7/reviews');
    });

    it('calls version-level routes', async () => {
      const { client, call } = setup();

      await client.v1.health();
      expect(call().url).toBe('https://api.test/v1/health');
      expect(call().init.method).toBe('GET');
    });

    it('encodes path parameters', async () => {
      const { client, call } = setup(json({ id: 'a/b c', name: 'x' }));

      await client.v1.products.get({ params: { id: 'a/b c' } });
      expect(call().url).toBe('https://api.test/v1/products/a%2Fb%20c');
    });

    it('rejects when a path parameter is missing', async () => {
      const { client, fetch } = setup();

      await expect(client.v1.products.get({ params: {} } as never)).rejects.toThrow(
        'Missing path parameter "id" for GET /v1/products/:id',
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it('serializes query parameters, repeating keys for arrays and skipping empty values', async () => {
      const { client, call } = setup(json([]));

      await client.v1.products.list({
        query: { page: 2, tag: ['a', 'b'], skipped: undefined, empty: null } as never,
      });
      expect(call().url).toBe('https://api.test/v1/products?page=2&tag=a&tag=b');
    });

    it('serializes dates and booleans in the query', async () => {
      const { client, call } = setup(json([]));
      const at = new Date('2026-11-03T10:00:00.000Z');

      await client.v1.products.list({ query: { at, active: true } } as never);
      expect(call().url).toBe(
        'https://api.test/v1/products?at=2026-11-03T10%3A00%3A00.000Z&active=true',
      );
    });

    it('rejects nested objects in the query', async () => {
      const { client } = setup();

      await expect(
        client.v1.products.list({ query: { filter: { a: 1 } } } as never),
      ).rejects.toThrow(TypeError);
    });

    it('sends a JSON body on POST', async () => {
      const { client, call } = setup(json({ id: '1', name: 'Pen' }));

      await client.v1.products.create({ body: { name: 'Pen' } });
      expect(call().init.method).toBe('POST');
      expect(call().init.body).toBe('{"name":"Pen"}');
      expect(call().headers.get('content-type')).toBe('application/json');
    });

    it('does not send a body on DELETE', async () => {
      const { client, call } = setup(json({ id: '1', name: 'Pen' }));

      await client.v1.products.remove({ params: { id: '1' }, body: { x: 1 } } as never);
      expect(call().init.body).toBeUndefined();
      expect(call().headers.has('content-type')).toBe(false);
    });

    it('asks for JSON and Problem Details by default', async () => {
      const { client, call } = setup();

      await client.v1.health();
      expect(call().headers.get('accept')).toBe('application/json, application/problem+json');
    });

    it('merges static, dynamic and per-request headers', async () => {
      const token = vi.fn(async () => ({ Authorization: 'Bearer t1', 'X-Trace': 'a' }));
      const { client, call } = setup(json({ ok: true }), { headers: token });

      await client.v1.health({ headers: { 'X-Trace': undefined, 'X-Extra': '1' } });
      expect(token).toHaveBeenCalledOnce();
      expect(call().headers.get('authorization')).toBe('Bearer t1');
      expect(call().headers.has('x-trace')).toBe(false);
      expect(call().headers.get('x-extra')).toBe('1');
    });

    it('passes the signal and fetch options', async () => {
      const { client, call } = setup(json({ ok: true }), {
        fetchOptions: { credentials: 'include' },
      });
      const controller = new AbortController();

      await client.v1.health({ signal: controller.signal, fetchOptions: { cache: 'no-store' } });
      expect(call().init).toMatchObject({ credentials: 'include', cache: 'no-store' });
      expect(call().init.signal).toBe(controller.signal);
    });

    it('uses the global fetch at call time, called without a receiver', async () => {
      const original = globalThis.fetch;
      const receivers: unknown[] = [];
      globalThis.fetch = vi.fn(async function (this: unknown) {
        receivers.push(this);
        return json({ ok: true });
      }) as typeof fetch;
      try {
        const client = createClient(api, { baseUrl: 'https://api.test' });

        await expect(client.v1.health()).resolves.toMatchObject({ status: 200 });
        expect(receivers).toEqual([undefined]);
      } finally {
        globalThis.fetch = original;
      }
    });
  });

  describe('responses', () => {
    it('returns status, parsed body and headers', async () => {
      const { client } = setup(json({ id: '1', name: 'Pen' }));

      const res = await client.v1.products.get({ params: { id: '1' } });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: '1', name: 'Pen' });
      expect(res.headers.get('content-type')).toBe('application/json');
    });

    it('returns declared problem responses', async () => {
      const problem = { type: 'about:blank', title: 'Not Found', status: 404, code: 'NOT_FOUND' };
      const { client } = setup(json(problem, 404, 'application/problem+json'));

      const res = await client.v1.products.get({ params: { id: '1' } });
      expect(res).toMatchObject({ status: 404, body: problem });
    });

    it('returns the implicit 422 and 401 responses', async () => {
      const unprocessable = setup(json({ status: 422 }, 422, 'application/problem+json'));
      const unauthorized = setup(json({ status: 401 }, 401, 'application/problem+json'));

      await expect(
        unprocessable.client.v1.products.get({ params: { id: '1' } }),
      ).resolves.toMatchObject({ status: 422 });
      await expect(
        unauthorized.client.v1.products.create({ body: { name: 'x' } }),
      ).resolves.toMatchObject({ status: 401 });
    });

    it('throws UnexpectedResponseError for statuses the route does not declare', async () => {
      const problem = { type: 'about:blank', title: 'Internal Server Error', status: 500 };
      const { client } = setup(json(problem, 500, 'application/problem+json'));

      const error = await client.v1.health().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(UnexpectedResponseError);
      expect(error).toMatchObject({ status: 500, body: problem, problem });
      expect(isResponseError(error)).toBe(true);
    });

    it('returns non-JSON bodies as text and empty bodies as undefined', async () => {
      const text = setup(new Response('plain', { headers: { 'content-type': 'text/plain' } }));
      const empty = setup(new Response(null, { status: 200 }));

      await expect(text.client.v1.health()).resolves.toMatchObject({ body: 'plain' });
      await expect(empty.client.v1.health()).resolves.toMatchObject({ body: undefined });
    });

    it('throws UnexpectedResponseError for invalid JSON', async () => {
      const { client } = setup(
        new Response('{oops', { headers: { 'content-type': 'application/json' } }),
      );

      await expect(client.v1.health()).rejects.toThrow('Response body is not valid JSON');
    });

    it('validates and transforms bodies with validateResponse', async () => {
      const { client } = setup(json({ at: '2026-11-03T10:00:00.000Z' }), {
        validateResponse: true,
      });

      const res = await client.v1.products.dated();
      expect(res.body.at).toBeInstanceOf(Date);
    });

    it('throws ResponseValidationError when a body does not match', async () => {
      const { client } = setup(json({ id: 1 }), { validateResponse: true });

      const error = await client.v1.products.get({ params: { id: '1' } }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ResponseValidationError);
      expect((error as ResponseValidationError).issues.length).toBeGreaterThan(0);
    });
  });

  it('rejects contracts where a name is both a route and a group', () => {
    const clash = {
      v1: {
        routes: { products: route.get('/products').returns(Product) },
        children: { products: { routes: { list: route.get('/').returns(z.array(Product)) } } },
      },
    };

    expect(() => createClient(clash, { baseUrl: '/' })).toThrow(
      'typeful-api client: "v1/products" is both a route and a group',
    );
  });
});

describe('unwrap', () => {
  const headers = new Headers();

  it('returns the body of a 200 response', () => {
    expect(unwrap({ status: 200 as const, body: { ok: true }, headers })).toEqual({ ok: true });
  });

  it('throws a ResponseError with the problem for other statuses', () => {
    const problem = {
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: 'No product 7',
    };

    expect(() => unwrap({ status: 404 as const, body: problem, headers })).toThrow(
      new ResponseError({ status: 404, body: problem, headers }, '404 Not Found: No product 7'),
    );
  });

  it('describes non-problem bodies by status', () => {
    expect(() => unwrap({ status: 409 as const, body: 'nope', headers })).toThrow(
      'Request failed with status 409',
    );
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
