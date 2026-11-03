import { generateClient } from '@typeful-api/cli';
import { HttpError, defineApi, paginated, paginationQuery, route } from '@typeful-api/core';
import { UnexpectedResponseError, unwrap } from '@typeful-api/core/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createHonoRouter } from '../../src/adapter';

/**
 * A service in another repository only sees this API's /api-doc. These tests generate a client
 * from the Hono router's own document and call the router through it.
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

const app = createHonoRouter(
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
    fetch?: (input: string, init: RequestInit) => Promise<Response>;
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

let generated: GeneratedModule;
const fetchViaRouter = (input: string, init: RequestInit) =>
  Promise.resolve(app.request(input, init));

beforeAll(async () => {
  fs.rmSync(generatedDir, { recursive: true, force: true });
  const spec = await (await app.request('/api-doc')).json();
  await generateClient({ spec, out });
  generated = (await import(out)) as GeneratedModule;
});

afterAll(() => fs.rmSync(generatedDir, { recursive: true, force: true }));

describe('client generated from the Hono /api-doc', () => {
  const client = () =>
    generated.createApiClient({ baseUrl: 'http://localhost', fetch: fetchViaRouter });

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
      baseUrl: 'http://localhost',
      fetch: fetchViaRouter,
      headers: async () => ({ Authorization: 'Bearer secret' }),
    });

    expect(await authed.v1.orders.create({ body: { total: 5 } }).then(unwrap)).toEqual({
      id: 'new',
      total: 5,
    });
  });

  it('throws UnexpectedResponseError for undocumented statuses', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(client().v1.orders.crash()).rejects.toBeInstanceOf(UnexpectedResponseError);
    consoleError.mockRestore();
  });

  it('types requests and responses from the document', () => {
    const consumer = path.join(generatedDir, 'consumer.ts');
    fs.writeFileSync(
      consumer,
      `import { createApiClient } from './orders-client';

const orders = createApiClient({ baseUrl: 'https://orders.internal/api' });

export async function useOrders() {
  const res = await orders.v1.orders.get({ params: { id: '1' } });
  if (res.status === 200) {
    const total: number = res.body.total;
    void total;
  }
  if (res.status === 404) {
    const code: 'NOT_FOUND' = res.body.code;
    void code;
  }

  const created = await orders.v1.orders.create({ body: { total: 3 } });
  const status: 200 | 401 | 422 = created.status;
  void status;

  await orders.v1.orders.list({ query: { page: 2 } });

  // @ts-expect-error total must be a number
  await orders.v1.orders.create({ body: { total: 'three' } });
}
`,
    );

    const program = ts.createProgram([consumer], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    });
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));

    expect(diagnostics).toEqual([]);
  }, 30_000);
});
