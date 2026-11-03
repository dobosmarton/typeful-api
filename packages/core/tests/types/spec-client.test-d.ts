import { describe, expectTypeOf, it } from 'vitest';
import { createSpecClient, unwrap, type InferClientArgs } from '../../src/client';

// Shaped like openapi-typescript output for a typeful-api /api-doc
interface paths {
  '/v1/health': {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get: operations['v1__health'];
    post?: never;
  };
  '/v1/orders': {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get: operations['v1_orders_list'];
    post: operations['v1_orders_create'];
  };
  '/v1/orders/{id}': {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get: operations['v1_orders_get'];
    delete: operations['v1_orders_remove'];
  };
}

type Problem<S extends number, C extends string> = {
  type: string;
  title: string;
  status: S;
  code: C;
  detail?: string;
  [key: string]: unknown;
};
type Order = { id: string; total: number };

interface operations {
  v1__health: {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    requestBody?: never;
    responses: {
      200: {
        headers: { [name: string]: unknown };
        content: { 'application/json': { ok: boolean } };
      };
    };
  };
  v1_orders_list: {
    parameters: {
      query?: { page?: number; status?: 'open' | 'closed' };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: { headers: { [name: string]: unknown }; content: { 'application/json': Order[] } };
      422: {
        headers: { [name: string]: unknown };
        content: { 'application/problem+json': Problem<422, 'VALIDATION_FAILED'> };
      };
    };
  };
  v1_orders_create: {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    requestBody: { content: { 'application/json': { items: string[]; note?: string } } };
    responses: {
      201: { headers: { [name: string]: unknown }; content: { 'application/json': Order } };
      401: {
        headers: { [name: string]: unknown };
        content: { 'application/problem+json': Problem<401, 'UNAUTHORIZED'> };
      };
    };
  };
  v1_orders_get: {
    parameters: { query?: never; header?: never; path: { id: string }; cookie?: never };
    requestBody?: never;
    responses: {
      200: { headers: { [name: string]: unknown }; content: { 'application/json': Order } };
      404: {
        headers: { [name: string]: unknown };
        content: { 'application/problem+json': Problem<404, 'NOT_FOUND'> };
      };
    };
  };
  v1_orders_remove: {
    parameters: { query?: never; header?: never; path: { id: string }; cookie?: never };
    requestBody?: never;
    responses: { 204: { headers: { [name: string]: unknown }; content?: never } };
  };
}

const routes = {
  v1: {
    health: { method: 'get', path: '/v1/health', statuses: [200] },
    orders: {
      list: { method: 'get', path: '/v1/orders', statuses: [200, 422] },
      create: { method: 'post', path: '/v1/orders', statuses: [201, 401] },
      get: { method: 'get', path: '/v1/orders/{id}', statuses: [200, 404] },
      remove: { method: 'delete', path: '/v1/orders/{id}', statuses: [204] },
    },
  },
} as const;

const client = createSpecClient<typeof routes, paths>(routes, { baseUrl: 'https://orders' });

describe('spec client arguments', () => {
  it('makes the argument optional when nothing is required', () => {
    expectTypeOf(client.v1.health).toBeCallableWith();
    expectTypeOf(client.v1.orders.list).toBeCallableWith();
  });

  it('types query parameters from the spec', () => {
    expectTypeOf<InferClientArgs<typeof client.v1.orders.list>['query']>().toEqualTypeOf<
      { page?: number; status?: 'open' | 'closed' } | undefined
    >();
    // @ts-expect-error status must be one of the documented values
    void client.v1.orders.list({ query: { status: 'pending' } });
  });

  it('requires path parameters and a required body', () => {
    expectTypeOf(client.v1.orders.get).toBeCallableWith({ params: { id: '1' } });
    expectTypeOf(client.v1.orders.create).toBeCallableWith({ body: { items: ['a'] } });
    // @ts-expect-error params are required
    void client.v1.orders.get();
    // @ts-expect-error the body is required
    void client.v1.orders.create();
    // @ts-expect-error GET routes take no body
    void client.v1.orders.get({ params: { id: '1' }, body: {} });
  });
});

describe('spec client responses', () => {
  it('unions the documented statuses', () => {
    type Res = Awaited<ReturnType<typeof client.v1.orders.create>>;

    expectTypeOf<Res['status']>().toEqualTypeOf<201 | 401>();
  });

  it('narrows JSON and problem bodies by status', async () => {
    const res = await client.v1.orders.get({ params: { id: '1' } });

    if (res.status === 200) expectTypeOf(res.body).toEqualTypeOf<Order>();
    if (res.status === 404) expectTypeOf(res.body.code).toEqualTypeOf<'NOT_FOUND'>();
  });

  it('types responses without content as undefined', async () => {
    const res = await client.v1.orders.remove({ params: { id: '1' } });

    expectTypeOf(res.body).toEqualTypeOf<undefined>();
  });

  it('unwrap returns the body of any 2xx response', async () => {
    expectTypeOf(
      await client.v1.orders.create({ body: { items: [] } }).then(unwrap),
    ).toEqualTypeOf<Order>();
    expectTypeOf(
      await client.v1.orders.get({ params: { id: '1' } }).then(unwrap),
    ).toEqualTypeOf<Order>();
  });
});
