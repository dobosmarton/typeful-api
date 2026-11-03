import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineApi } from '../../src/contract';
import { problemSchema } from '../../src/helpers/problem';
import { isProblemSchema, resolveRouteResponses } from '../../src/responses';
import { route } from '../../src/route';
import { generateSpec } from '../../src/spec';

const Item = z.object({ id: z.string() });

const statuses = (r: Parameters<typeof resolveRouteResponses>[0]) =>
  resolveRouteResponses(r).map(({ status, implicit }) => [status, implicit]);

describe('resolveRouteResponses', () => {
  it('returns only the success response for a route without input or auth', () => {
    expect(statuses(route.get('/').returns(Item))).toEqual([[200, false]]);
  });

  it('adds an implicit 422 when the route validates params, query or a body', () => {
    expect(statuses(route.get('/:id').params(Item).returns(Item))).toContainEqual([422, true]);
    expect(statuses(route.get('/').query(Item).returns(Item))).toContainEqual([422, true]);
    expect(statuses(route.post('/').body(Item).returns(Item))).toContainEqual([422, true]);
  });

  it('ignores a body on methods that do not validate one', () => {
    expect(statuses(route.get('/').body(Item).returns(Item))).toEqual([[200, false]]);
  });

  it('adds an implicit 401 for routes with auth', () => {
    expect(statuses(route.get('/').returns(Item).withAuth('bearer'))).toContainEqual([401, true]);
    expect(statuses(route.get('/').returns(Item).withAuth('none'))).toEqual([[200, false]]);
  });

  it('lets declared statuses replace the implicit ones', () => {
    const Custom = z.object({ reason: z.string() });
    const responses = resolveRouteResponses(
      route
        .post('/')
        .body(Item)
        .returns(Item)
        .withAuth('bearer')
        .withResponses({ 401: Custom, 422: Custom }),
    );

    expect(responses.filter((r) => r.implicit)).toEqual([]);
    expect(responses.find((r) => r.status === 422)?.schema).toBe(Custom);
  });

  it('picks the media type from the schema shape', () => {
    const responses = resolveRouteResponses(
      route
        .get('/')
        .returns(Item)
        .withErrors(404)
        .withResponses({ 409: problemSchema(409, 'DUPLICATE'), 418: z.object({ e: z.string() }) }),
    );
    const mediaTypes = Object.fromEntries(responses.map((r) => [r.status, r.mediaType]));

    expect(mediaTypes).toEqual({
      200: 'application/json',
      404: 'application/problem+json',
      409: 'application/problem+json',
      418: 'application/json',
    });
  });
});

describe('isProblemSchema', () => {
  it('detects objects with type, title and status', () => {
    expect(isProblemSchema(problemSchema(404, 'NOT_FOUND'))).toBe(true);
    expect(isProblemSchema(problemSchema(404, 'NOT_FOUND').describe('Missing'))).toBe(true);
  });

  it('rejects other schemas', () => {
    expect(isProblemSchema(z.object({ type: z.string(), title: z.string() }))).toBe(false);
    expect(isProblemSchema(z.string())).toBe(false);
    expect(isProblemSchema(z.array(Item))).toBe(false);
  });
});

describe('implicit responses in the OpenAPI spec', () => {
  const api = defineApi({
    v1: {
      routes: {
        create: route.post('/items').body(Item).returns(Item).withAuth('bearer'),
        health: route.get('/health').returns(z.object({ ok: z.boolean() })),
      },
    },
  });
  const spec = generateSpec(api, { info: { title: 'Test', version: '1.0.0' } });

  it('documents 422 and 401 problems for routes that can produce them', () => {
    const responses = spec.paths['/v1/items']?.post?.responses;

    expect(responses?.['422']?.description).toBe('Unprocessable Content');
    expect(responses?.['422']?.content?.['application/problem+json']?.schema).toBeDefined();
    expect(responses?.['401']?.content?.['application/problem+json']?.schema).toBeDefined();
  });

  it('does not add them to routes without input or auth', () => {
    expect(Object.keys(spec.paths['/v1/health']?.get?.responses ?? {})).toEqual(['200']);
  });
});
