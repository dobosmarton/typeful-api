import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { commonErrors, notFoundError, unauthorizedError } from '../../src/helpers/errors';
import { withHeaders } from '../../src/helpers/headers';
import { cursorQuery, paginationQuery } from '../../src/helpers/pagination';
import { route } from '../../src/route';
import type {
  ApiContract,
  HandlerFn,
  InferBody,
  InferBodyInput,
  InferParamsInput,
  InferQuery,
  InferQueryInput,
  RouteDefinition,
} from '../../src/types';

const Product = z.object({ id: z.string(), price: z.number() });

describe('route builder keeps literal types', () => {
  it('keeps the method and path', () => {
    const r = route.get('/products/:id').returns(Product);

    expectTypeOf(r.method).toEqualTypeOf<'get'>();
    expectTypeOf(r.path).toEqualTypeOf<'/products/:id'>();
  });

  it('keeps the auth type set before or after returns()', () => {
    const after = route.get('/').returns(Product).withAuth('bearer');
    const before = route.get('/').withAuth('apiKey').returns(Product);

    expectTypeOf(after.auth).toEqualTypeOf<'bearer' | undefined>();
    expectTypeOf(before.auth).toEqualTypeOf<'apiKey' | undefined>();
  });

  it('keeps declared error status codes with their schemas', () => {
    const r = route.get('/:id').returns(Product).withErrors(404, 401);
    type Responses = NonNullable<typeof r.responses>;

    expectTypeOf<keyof Responses>().toEqualTypeOf<404 | 401>();
    expectTypeOf<Responses[404]>().toEqualTypeOf<ReturnType<typeof notFoundError>>();
    expectTypeOf<Responses[401]>().toEqualTypeOf<ReturnType<typeof unauthorizedError>>();
  });

  it('merges responses across calls, later declarations win', () => {
    const Conflict = z.object({ reason: z.string() });
    const r = route
      .get('/')
      .withErrors(404)
      .returns(Product)
      .withResponses({ 404: Conflict, 409: Conflict })
      .withErrors(401);
    type Responses = NonNullable<typeof r.responses>;

    expectTypeOf<keyof Responses>().toEqualTypeOf<404 | 409 | 401>();
    expectTypeOf<Responses[404]>().toEqualTypeOf<typeof Conflict>();
  });

  it('keeps the state through metadata methods', () => {
    const r = route
      .post('/')
      .body(z.object({ name: z.string() }))
      .returns(Product)
      .withErrors(409)
      .withSummary('Create')
      .withTags('products')
      .markDeprecated()
      .withOperationId('createProduct');

    expectTypeOf<keyof NonNullable<typeof r.responses>>().toEqualTypeOf<409>();
    expectTypeOf<InferBody<typeof r>>().toEqualTypeOf<{ name: string }>();
  });

  it('types commonErrors() by status code', () => {
    const errors = commonErrors(404, 401);

    expectTypeOf<keyof typeof errors>().toEqualTypeOf<404 | 401>();
  });
});

describe('client input types vs handler output types', () => {
  it('paginationQuery: optional numbers in, required numbers out', () => {
    const r = route.get('/').query(paginationQuery()).returns(Product);

    expectTypeOf<InferQueryInput<typeof r>>().toEqualTypeOf<{
      page?: number | undefined;
      limit?: number | undefined;
    }>();
    expectTypeOf<InferQuery<typeof r>>().toEqualTypeOf<{ page: number; limit: number }>();
  });

  it('cursorQuery: limit is an optional number in', () => {
    const r = route.get('/').query(cursorQuery()).returns(Product);

    expectTypeOf<InferQueryInput<typeof r>>().toEqualTypeOf<{
      cursor?: string | undefined;
      limit?: number | undefined;
    }>();
  });

  it('transforms: raw input type in, transformed type out', () => {
    const r = route
      .post('/')
      .body(z.object({ when: z.string().transform((value) => new Date(value)) }))
      .returns(Product);

    expectTypeOf<InferBodyInput<typeof r>>().toEqualTypeOf<{ when: string }>();
    expectTypeOf<InferBody<typeof r>>().toEqualTypeOf<{ when: Date }>();
  });

  it('infers never for input slots a route does not define', () => {
    const r = route.get('/').returns(Product);

    expectTypeOf<InferBodyInput<typeof r>>().toBeNever();
    expectTypeOf<InferParamsInput<typeof r>>().toBeNever();
  });
});

describe('compatibility', () => {
  it('builder routes are RouteDefinitions and fit an ApiContract', () => {
    const r = route
      .get('/:id')
      .params(z.object({ id: z.string() }))
      .returns(Product)
      .withErrors(404)
      .withAuth('bearer');

    expectTypeOf(r).toExtend<RouteDefinition>();
    expectTypeOf({ v1: { routes: { r } } }).toExtend<ApiContract>();
  });

  it('raw object-literal routes without a body infer never', () => {
    const raw = { method: 'get', path: '/', response: Product } as const;

    expectTypeOf<InferBody<typeof raw>>().toBeNever();
  });

  it('lets handlers return withHeaders()', () => {
    const r = route.get('/').returns(Product);
    const handler: HandlerFn<typeof r> = () =>
      withHeaders({ id: '1', price: 1 }, { 'X-Total-Count': '1' });

    expectTypeOf(handler).toBeFunction();
  });

  it('rejects a handler returning the wrong shape', () => {
    const r = route.get('/').returns(Product);
    // @ts-expect-error price must be a number
    const handler: HandlerFn<typeof r> = () => ({ id: '1', price: '1' });

    expectTypeOf(handler).toBeFunction();
  });
});
