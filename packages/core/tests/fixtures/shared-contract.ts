// A contract as it would live in a shared package compiled with `declaration: true`.
// It imports the built package so the test exercises the published (bundled) .d.ts.
import { defineApi, paginated, paginationQuery, route } from '@typeful-api/core';
import { z } from 'zod';

const Product = z.object({ id: z.string(), name: z.string(), price: z.number() });

export const getProduct = route
  .get('/:id')
  .params(z.object({ id: z.string() }))
  .returns(Product)
  .withErrors(404)
  .withAuth('bearer');

export const api = defineApi({
  v1: {
    children: {
      products: {
        routes: {
          list: route.get('/').query(paginationQuery()).returns(paginated(Product)),
          get: getProduct,
          create: route
            .post('/')
            .body(Product.omit({ id: true }))
            .withResponses({ 409: z.object({ reason: z.string() }) })
            .returns(Product)
            .withSummary('Create a product'),
        },
      },
    },
  },
});
