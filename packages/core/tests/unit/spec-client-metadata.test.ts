import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineApi } from '../../src/contract';
import { paginationQuery } from '../../src/helpers/pagination';
import { route } from '../../src/route';
import { generateSpec } from '../../src/spec';

/**
 * Specs are the contract between services in different repositories, so request schemas must
 * describe what a client sends, and every operation must say where it sits in the contract.
 */
const api = defineApi({
  v1: {
    routes: { health: route.get('/health').returns(z.object({ ok: z.boolean() })) },
    children: {
      products: {
        routes: {
          list: route.get('/').query(paginationQuery()).returns(z.array(z.string())),
          create: route
            .post('/')
            .body(z.object({ name: z.string(), tags: z.array(z.string()).default([]) }))
            .returns(z.object({ createdAt: z.string().transform((value) => new Date(value)) })),
        },
        children: {
          reviews: { routes: { list: route.get('/reviews').returns(z.array(z.string())) } },
        },
      },
    },
  },
});
const spec = generateSpec(api, { info: { title: 'Test', version: '1.0.0' } });

describe('request schemas describe client input', () => {
  it('marks query parameters with defaults as optional', () => {
    const parameters = spec.paths['/v1/products']?.get?.parameters ?? [];

    expect(parameters.map(({ name, required }) => [name, required])).toEqual([
      ['page', false],
      ['limit', false],
    ]);
  });

  it('marks body fields with defaults as optional', () => {
    const schema =
      spec.paths['/v1/products']?.post?.requestBody?.content['application/json']?.schema;

    expect(schema?.required).toEqual(['name']);
  });
});

describe('x-typeful-route', () => {
  it('records version, groups and route name on every operation', () => {
    expect(spec.paths['/v1/health']?.get?.['x-typeful-route']).toEqual(['v1', 'health']);
    expect(spec.paths['/v1/products']?.get?.['x-typeful-route']).toEqual([
      'v1',
      'products',
      'list',
    ]);
    expect(spec.paths['/v1/products/reviews/reviews']?.get?.['x-typeful-route']).toEqual([
      'v1',
      'products',
      'reviews',
      'list',
    ]);
  });
});
