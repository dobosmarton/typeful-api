import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { defineApi } from '../../src/contract';
import { paginationQuery } from '../../src/helpers/pagination';
import { route } from '../../src/route';
import type {
  HandlerFn,
  InferBody,
  InferHandlers,
  InferParams,
  InferQuery,
  InferResponse,
} from '../../src/types';

const Product = z.object({ id: z.string(), price: z.number() });
type Product = z.infer<typeof Product>;

const getProduct = route
  .get('/:id')
  .params(z.object({ id: z.string() }))
  .returns(Product);
const createProduct = route
  .post('/')
  .body(z.object({ name: z.string().min(1) }))
  .returns(Product);
const listProducts = route.get('/').query(paginationQuery()).returns(z.array(Product));

describe('Infer* helpers (server-side, post-parse types)', () => {
  it('infers body, params and response output types', () => {
    expectTypeOf<InferBody<typeof createProduct>>().toEqualTypeOf<{ name: string }>();
    expectTypeOf<InferParams<typeof getProduct>>().toEqualTypeOf<{ id: string }>();
    expectTypeOf<InferResponse<typeof getProduct>>().toEqualTypeOf<Product>();
  });

  it('infers never for slots a route does not define', () => {
    expectTypeOf<InferBody<typeof getProduct>>().toBeNever();
    expectTypeOf<InferQuery<typeof getProduct>>().toBeNever();
    expectTypeOf<InferParams<typeof createProduct>>().toBeNever();
  });

  it('infers query defaults as present (output type)', () => {
    expectTypeOf<InferQuery<typeof listProducts>>().toEqualTypeOf<{
      page: number;
      limit: number;
    }>();
  });

  it('infers raw object-literal routes', () => {
    const raw = {
      method: 'get',
      path: '/search',
      query: z.object({ q: z.string() }),
      response: z.array(Product),
    } as const;

    expectTypeOf<InferQuery<typeof raw>>().toEqualTypeOf<{ q: string }>();
    expectTypeOf<InferResponse<typeof raw>>().toEqualTypeOf<Product[]>();
  });
});

describe('handler types', () => {
  const api = defineApi({
    v1: {
      children: {
        products: { routes: { get: getProduct, create: createProduct } },
      },
    },
  });

  it('mirrors the contract tree and types handler input and output', () => {
    type Handlers = InferHandlers<typeof api>;
    type GetHandler = Handlers['v1']['products']['get'];

    expectTypeOf<Parameters<GetHandler>[0]['params']>().toEqualTypeOf<{ id: string }>();
    expectTypeOf<Awaited<ReturnType<GetHandler>>>().toEqualTypeOf<Product>();
  });

  it('accepts sync and async handlers', () => {
    const sync: HandlerFn<typeof getProduct> = ({ params }) => ({ id: params.id, price: 1 });
    const async: HandlerFn<typeof getProduct> = async ({ params }) => ({ id: params.id, price: 1 });

    expectTypeOf(sync).toBeFunction();
    expectTypeOf(async).toBeFunction();
  });
});
