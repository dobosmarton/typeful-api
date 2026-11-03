import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  createClient,
  unwrap,
  type ClientResponse,
  type InferClientArgs,
  type InferClientBody,
  type RouteArgs,
} from '../../src/client';
import { defineApi } from '../../src/contract';
import { paginationQuery } from '../../src/helpers/pagination';
import { problemSchema } from '../../src/helpers/problem';
import { route } from '../../src/route';

const Product = z.object({ id: z.string(), name: z.string(), createdAt: z.iso.datetime() });
type Product = z.infer<typeof Product>;
const Conflict = problemSchema(409, 'DUPLICATE_NAME');

const api = defineApi({
  v1: {
    routes: {
      health: route.get('/health').returns(z.object({ ok: z.boolean() })),
    },
    children: {
      products: {
        routes: {
          list: route.get('/').query(paginationQuery()).returns(z.array(Product)),
          get: route
            .get('/:id')
            .params(z.object({ id: z.string() }))
            .returns(Product)
            .withErrors(404),
          byPath: route.get('/by-sku/:sku/variant/:variant').returns(Product),
          create: route
            .post('/')
            .body(z.object({ name: z.string(), tags: z.array(z.string()).default([]) }))
            .returns(Product)
            .withAuth('bearer')
            .withResponses({ 409: Conflict }),
          remove: route
            .delete('/:id')
            .params(z.object({ id: z.string() }))
            .returns(Product),
        },
        children: {
          reviews: { routes: { list: route.get('/reviews').returns(z.array(z.string())) } },
        },
      },
    },
  },
});

const client = createClient(api, { baseUrl: 'https://api.example.com' });

describe('client tree', () => {
  it('mirrors the contract, including version-level routes and nested groups', () => {
    expectTypeOf(client.v1.health).toBeFunction();
    expectTypeOf(client.v1.products.list).toBeFunction();
    expectTypeOf(client.v1.products.reviews.list).toBeFunction();
  });
});

describe('arguments', () => {
  it('makes the argument optional when nothing is required', () => {
    expectTypeOf(client.v1.health).toBeCallableWith();
    expectTypeOf(client.v1.products.list).toBeCallableWith();
  });

  it('uses Zod input types, so query fields with defaults are optional numbers', () => {
    type Args = InferClientArgs<typeof client.v1.products.list>;

    expectTypeOf<Args['query']>().toEqualTypeOf<
      { page?: number | undefined; limit?: number | undefined } | undefined
    >();
    // @ts-expect-error page must be a number
    void client.v1.products.list({ query: { page: '2' } });
  });

  it('requires params from the params schema', () => {
    expectTypeOf(client.v1.products.get).toBeCallableWith({ params: { id: '1' } });
    // @ts-expect-error params are required
    void client.v1.products.get();
  });

  it('infers params from the path when there is no params schema', () => {
    expectTypeOf<InferClientArgs<typeof client.v1.products.byPath>['params']>().toEqualTypeOf<
      Record<'sku' | 'variant', string | number>
    >();
  });

  it('only accepts a body on POST, PUT and PATCH routes, with defaults optional', () => {
    expectTypeOf<InferClientArgs<typeof client.v1.products.create>['body']>().toEqualTypeOf<{
      name: string;
      tags?: string[] | undefined;
    }>();
    // @ts-expect-error GET routes take no body
    void client.v1.products.get({ params: { id: '1' }, body: {} });
  });

  it('exposes RouteArgs for a route definition', () => {
    expectTypeOf<RouteArgs<typeof api.v1.children.products.routes.get>['params']>().toEqualTypeOf<{
      id: string;
    }>();
  });
});

describe('responses', () => {
  it('only has a 200 response for a route without input, auth or declared errors', () => {
    type Res = Awaited<ReturnType<typeof client.v1.health>>;

    expectTypeOf<Res['status']>().toEqualTypeOf<200>();
    expectTypeOf<Res['body']>().toEqualTypeOf<{ ok: boolean }>();
  });

  it('adds declared errors and the implicit 422 for routes with input', () => {
    type Res = Awaited<ReturnType<typeof client.v1.products.get>>;

    expectTypeOf<Res['status']>().toEqualTypeOf<200 | 404 | 422>();
  });

  it('adds the implicit 401 for routes with auth, and declared custom problems', () => {
    type Res = Awaited<ReturnType<typeof client.v1.products.create>>;

    expectTypeOf<Res['status']>().toEqualTypeOf<200 | 401 | 409 | 422>();
    expectTypeOf<
      InferClientBody<typeof client.v1.products.create, 409>['code']
    >().toEqualTypeOf<'DUPLICATE_NAME'>();
  });

  it('narrows the body by status', async () => {
    const res = await client.v1.products.get({ params: { id: '1' } });

    if (res.status === 200) expectTypeOf(res.body).toEqualTypeOf<Product>();
    if (res.status === 404) expectTypeOf(res.body.code).toEqualTypeOf<'NOT_FOUND'>();
    if (res.status === 422) {
      expectTypeOf(res.body.errors).toEqualTypeOf<
        | { location: 'body' | 'query' | 'params'; path: (string | number)[]; message: string }[]
        | undefined
      >();
    }
  });

  it('unwrap returns the 200 body', async () => {
    const products = await client.v1.products.list().then(unwrap);

    expectTypeOf(products).toEqualTypeOf<Product[]>();
  });

  it('exposes ClientResponse for a route definition', () => {
    expectTypeOf<
      ClientResponse<typeof api.v1.children.products.routes.remove>['status']
    >().toEqualTypeOf<200 | 422>();
  });
});

describe('raw object-literal contracts', () => {
  const raw = {
    v1: {
      routes: {
        get: {
          method: 'get',
          path: '/items/:id',
          params: z.object({ id: z.string() }),
          response: z.object({ id: z.string() }),
          responses: { 404: problemSchema(404, 'NOT_FOUND') },
          auth: 'bearer',
        },
      },
    },
  } as const;
  const rawClient = createClient(raw, { baseUrl: '/' });

  it('types them like builder routes', () => {
    type Res = Awaited<ReturnType<typeof rawClient.v1.get>>;

    expectTypeOf<Res['status']>().toEqualTypeOf<200 | 401 | 404 | 422>();
    expectTypeOf(rawClient.v1.get).toBeCallableWith({ params: { id: '1' } });
  });
});
