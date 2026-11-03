import { defineApi, generateSpec, paginationQuery, route } from '@typeful-api/core';
import fs from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  buildRouteMap,
  generateClientFile,
  loadSpec,
  outputKind,
} from '../../src/client-generator';

const Order = z.object({ id: z.string(), total: z.number() });

const api = defineApi({
  v1: {
    routes: { health: route.get('/health').returns(z.object({ ok: z.boolean() })) },
    children: {
      orders: {
        routes: {
          list: route.get('/').query(paginationQuery()).returns(z.array(Order)),
          get: route
            .get('/:id')
            .params(z.object({ id: z.string() }))
            .returns(Order)
            .withErrors(404),
          create: route
            .post('/')
            .body(z.object({ items: z.array(z.string()).min(1) }))
            .returns(Order)
            .withAuth('bearer'),
        },
        children: {
          items: {
            routes: {
              list: route
                .get('/:id/items')
                .params(z.object({ id: z.string() }))
                .returns(z.array(z.string())),
            },
          },
        },
      },
    },
  },
});
const spec = generateSpec(api, { info: { title: 'Orders', version: '1.0.0' } });

const generatedDir = fileURLToPath(new URL('../.generated/', import.meta.url));

describe('outputKind', () => {
  it.each([
    ['client.d.ts', 'types'],
    ['client.d.mts', 'types'],
    ['orders.ts', 'module'],
    ['orders.mts', 'module'],
  ])('%s → %s', (out, kind) => {
    expect(outputKind(out)).toBe(kind);
  });

  it('rejects other extensions', () => {
    expect(() => outputKind('client.js')).toThrow('--out must be a .ts file');
  });
});

describe('buildRouteMap', () => {
  it('mirrors the contract using x-typeful-route', () => {
    expect(buildRouteMap(spec)).toEqual({
      v1: {
        health: { method: 'get', path: '/v1/health', statuses: [200] },
        orders: {
          list: { method: 'get', path: '/v1/orders', statuses: [200, 422] },
          get: { method: 'get', path: '/v1/orders/{id}', statuses: [200, 404, 422] },
          create: { method: 'post', path: '/v1/orders', statuses: [200, 401, 422] },
          items: {
            list: { method: 'get', path: '/v1/orders/items/{id}/items', statuses: [200, 422] },
          },
        },
      },
    });
  });

  it('falls back to operationId, then to method and path, for other specs', () => {
    const foreign = {
      openapi: '3.0.0',
      paths: {
        '/users/{id}': {
          get: { operationId: 'getUser', responses: { '200': {}, '4XX': {}, default: {} } },
          delete: { responses: { '204': {} } },
        },
      },
    };

    expect(buildRouteMap(foreign)).toEqual({
      getUser: { method: 'get', path: '/users/{id}', statuses: [200] },
      delete_users_id: { method: 'delete', path: '/users/{id}', statuses: [204] },
    });
  });

  it('rejects specs where a name is both a route and a group', () => {
    const clash = {
      openapi: '3.0.0',
      paths: {
        '/a': { get: { 'x-typeful-route': ['v1', 'orders'], responses: { '200': {} } } },
        '/b': { get: { 'x-typeful-route': ['v1', 'orders', 'list'], responses: { '200': {} } } },
      },
    };

    expect(() => buildRouteMap(clash)).toThrow('"v1.orders" is both a route and a group');
  });

  it('rejects two operations with the same position', () => {
    const duplicate = {
      openapi: '3.0.0',
      paths: {
        '/a': { get: { operationId: 'same', responses: {} } },
        '/b': { get: { operationId: 'same', responses: {} } },
      },
    };

    expect(() => buildRouteMap(duplicate)).toThrow('two operations map to "same"');
  });
});

describe('loadSpec from a URL', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/api-doc' && req.headers.authorization === 'Bearer docs') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(spec));
      } else if (req.url === '/not-openapi') {
        res.writeHead(200, { 'content-type': 'application/json' }).end('{"hello":"world"}');
      } else {
        res.writeHead(401).end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('fetches the spec with the given headers', async () => {
    const { spec: loaded, label } = await loadSpec(`${baseUrl}/api-doc`, {
      Authorization: 'Bearer docs',
    });

    expect(loaded.openapi).toBe('3.0.0');
    expect(label).toBe(`${baseUrl}/api-doc`);
  });

  it('reports failed requests and documents that are not OpenAPI', async () => {
    await expect(loadSpec(`${baseUrl}/api-doc`)).rejects.toThrow('401');
    await expect(loadSpec(`${baseUrl}/not-openapi`)).rejects.toThrow('not an OpenAPI 3 document');
  });
});

describe('generated client module', () => {
  const out = path.join(generatedDir, 'orders.ts');
  const consumer = path.join(generatedDir, 'consumer.ts');

  beforeAll(async () => {
    fs.rmSync(generatedDir, { recursive: true, force: true });
    await generateClientFile({ spec, out });
  });

  afterAll(() => fs.rmSync(generatedDir, { recursive: true, force: true }));

  it('type-checks, together with code that uses it', () => {
    fs.writeFileSync(
      consumer,
      `import { createApiClient } from './orders';

const api = createApiClient({ baseUrl: 'https://orders.internal' });

export async function useClient() {
  const order = await api.v1.orders.get({ params: { id: '1' } });
  if (order.status === 200) {
    const total: number = order.body.total;
    void total;
  }
  if (order.status === 404) {
    const code: 'NOT_FOUND' = order.body.code;
    void code;
  }

  await api.v1.orders.list();
  await api.v1.orders.list({ query: { page: 2 } });
  await api.v1.orders.create({ body: { items: ['a'] } });
  await api.v1.orders.items.list({ params: { id: '1' } });

  // @ts-expect-error params are required
  await api.v1.orders.get();
  // @ts-expect-error page must be a number
  await api.v1.orders.list({ query: { page: 'two' } });
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

  it('calls the API at runtime', async () => {
    const { createApiClient } = await import(out);
    const requests: string[] = [];
    const api = createApiClient({
      baseUrl: 'https://orders.internal/api',
      fetch: async (url: string) => {
        requests.push(url);
        return new Response(JSON.stringify({ id: '7', total: 3 }), {
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    const res = await api.v1.orders.get({ params: { id: '7' } });

    expect(res).toMatchObject({ status: 200, body: { id: '7', total: 3 } });
    expect(requests).toEqual(['https://orders.internal/api/v1/orders/7']);
  });

  it('writes each statuses list on one line', () => {
    expect(fs.readFileSync(out, 'utf-8')).toContain('"statuses": [200, 404, 422]');
  });

  it('still writes types only for .d.ts output', async () => {
    const typesOut = path.join(generatedDir, 'orders.d.ts');
    const { kind, routeCount } = await generateClientFile({ spec, out: typesOut });

    expect(kind).toBe('types');
    expect(routeCount).toBe(0);
    expect(fs.readFileSync(typesOut, 'utf-8')).not.toContain('createApiClient');
  });
});
