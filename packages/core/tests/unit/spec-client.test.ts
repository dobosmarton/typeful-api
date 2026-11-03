import { describe, expect, it, vi } from 'vitest';
import { UnexpectedResponseError, createSpecClient, unwrap } from '../../src/client';

const routes = {
  v1: {
    health: { method: 'get', path: '/v1/health', statuses: [200] },
    orders: {
      create: { method: 'post', path: '/v1/orders', statuses: [201, 401] },
      get: { method: 'get', path: '/v1/orders/{id}', statuses: [200, 404] },
      item: { method: 'get', path: '/v1/orders/{orderId}/items/{itemId}', statuses: [200] },
      remove: { method: 'delete', path: '/v1/orders/{id}', statuses: [204] },
    },
  },
} as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// These tests cover runtime behavior without openapi-typescript types; types are tested separately
type LooseCaller = (args?: object) => Promise<{ status: number; body: unknown }>;
type LooseClient = {
  v1: { health: LooseCaller; orders: Record<'create' | 'get' | 'item' | 'remove', LooseCaller> };
};

const setup = (response: Response) => {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => response.clone());
  const client = createSpecClient(routes, { baseUrl: 'https://orders.internal/api/', fetch });
  return { client: client as unknown as LooseClient, fetch };
};

describe('createSpecClient', () => {
  it('builds the client tree from the route map', async () => {
    const { client, fetch } = setup(json({ ok: true }));

    await client.v1.health();
    expect(fetch.mock.calls[0]?.[0]).toBe('https://orders.internal/api/v1/health');
  });

  it('interpolates OpenAPI path templates', async () => {
    const { client, fetch } = setup(json({}));

    await client.v1.orders.item({ params: { orderId: 'o 1', itemId: 7 } });
    expect(fetch.mock.calls[0]?.[0]).toBe('https://orders.internal/api/v1/orders/o%201/items/7');
  });

  it('sends JSON bodies and returns documented non-200 statuses', async () => {
    const { client, fetch } = setup(json({ id: '1', total: 3 }, 201));

    const res = await client.v1.orders.create({ body: { items: ['a'] } });
    expect(res).toMatchObject({ status: 201, body: { id: '1', total: 3 } });
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', body: '{"items":["a"]}' });
  });

  it('returns undefined for empty responses', async () => {
    const { client } = setup(new Response(null, { status: 204 }));

    await expect(client.v1.orders.remove({ params: { id: '1' } })).resolves.toMatchObject({
      status: 204,
      body: undefined,
    });
  });

  it('throws UnexpectedResponseError for statuses the spec does not document', async () => {
    const { client } = setup(json({ title: 'Internal Server Error', status: 500 }, 500));

    await expect(client.v1.orders.get({ params: { id: '1' } })).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
  });

  it('unwraps any 2xx response', async () => {
    const { client } = setup(json({ id: '1' }, 201));

    await expect(client.v1.orders.create({ body: {} }).then(unwrap)).resolves.toEqual({ id: '1' });
  });
});
