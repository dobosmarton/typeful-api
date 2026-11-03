import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  badRequestError,
  commonErrors,
  conflictError,
  forbiddenError,
  internalError,
  notFoundError,
  rateLimitError,
  unauthorizedError,
  unprocessableError,
} from '../../src/helpers/errors';
import { defaultCode } from '../../src/helpers/status';
import { defineApi } from '../../src/contract';
import { route } from '../../src/route';
import { generateSpec } from '../../src/spec';

const problem = (status: number, code: string, extra: Record<string, unknown> = {}) => ({
  type: 'about:blank',
  title: 'Title',
  status,
  code,
  ...extra,
});

describe('error helpers', () => {
  describe('built-in Problem Details schemas', () => {
    const cases = [
      [badRequestError, 400, 'BAD_REQUEST'],
      [unauthorizedError, 401, 'UNAUTHORIZED'],
      [forbiddenError, 403, 'FORBIDDEN'],
      [notFoundError, 404, 'NOT_FOUND'],
      [conflictError, 409, 'CONFLICT'],
      [unprocessableError, 422, 'VALIDATION_FAILED'],
      [rateLimitError, 429, 'RATE_LIMIT_EXCEEDED'],
      [internalError, 500, 'INTERNAL_ERROR'],
    ] as const;

    it.each(cases)('%o accepts its status and code', (factory, status, code) => {
      expect(factory().safeParse(problem(status, code)).success).toBe(true);
    });

    it.each(cases)('%o uses the same code HttpError uses by default', (_factory, status, code) => {
      expect(defaultCode(status)).toBe(code);
    });

    it.each(cases)('%o rejects another code', (factory, status) => {
      expect(factory().safeParse(problem(status, 'SOMETHING_ELSE')).success).toBe(false);
    });

    it('rejects a mismatching status', () => {
      expect(notFoundError().safeParse(problem(410, 'NOT_FOUND')).success).toBe(false);
    });

    it('requires type and title', () => {
      expect(notFoundError().safeParse({ status: 404, code: 'NOT_FOUND' }).success).toBe(false);
    });

    it('accepts optional detail and instance', () => {
      const result = notFoundError().safeParse(
        problem(404, 'NOT_FOUND', { detail: 'Product 42 not found', instance: '/products/42' }),
      );
      expect(result.success).toBe(true);
    });

    it('keeps unknown extension members', () => {
      const result = notFoundError().parse(problem(404, 'NOT_FOUND', { traceId: 'abc' }));
      expect(result).toMatchObject({ traceId: 'abc' });
    });

    it('validates field errors on 400 and 422', () => {
      const errors = [{ location: 'body', path: ['items', 0, 'name'], message: 'Required' }];
      expect(
        unprocessableError().safeParse(problem(422, 'VALIDATION_FAILED', { errors })).success,
      ).toBe(true);
      expect(badRequestError().safeParse(problem(400, 'BAD_REQUEST', { errors })).success).toBe(
        true,
      );
      expect(
        unprocessableError().safeParse(
          problem(422, 'VALIDATION_FAILED', { errors: [{ location: 'header', path: [] }] }),
        ).success,
      ).toBe(false);
    });
  });

  describe('commonErrors', () => {
    it('returns schemas keyed by status code', () => {
      const errors = commonErrors(404, 401);
      expect(errors[404]).toBeDefined();
      expect(errors[401]).toBeDefined();
      expect(Object.keys(errors)).toEqual(['401', '404']);
    });

    it('returns empty record for no codes', () => {
      expect(Object.keys(commonErrors())).toHaveLength(0);
    });

    it('maps all supported codes', () => {
      const errors = commonErrors(400, 401, 403, 404, 409, 422, 429, 500);
      expect(Object.keys(errors)).toHaveLength(8);
    });

    it('returns working Zod schemas', () => {
      expect(commonErrors(404)[404].safeParse(problem(404, 'NOT_FOUND')).success).toBe(true);
    });
  });

  describe('withErrors on route builder', () => {
    it('adds error responses via FinalRoute (after .returns())', () => {
      const getRoute = route
        .get('/:id')
        .params(z.object({ id: z.string() }))
        .returns(z.object({ name: z.string() }))
        .withErrors(404, 401);

      expect(getRoute.responses?.[404]).toBeDefined();
      expect(getRoute.responses?.[401]).toBeDefined();
    });

    it('adds error responses via RouteBuilder (before .returns())', () => {
      const getRoute = route
        .get('/:id')
        .params(z.object({ id: z.string() }))
        .withErrors(404)
        .returns(z.object({ name: z.string() }));

      expect(getRoute.responses?.[404]).toBeDefined();
    });

    it('merges with existing withResponses', () => {
      const customSchema = z.object({ error: z.string() });
      const getRoute = route
        .get('/:id')
        .withResponses({ 503: customSchema })
        .withErrors(404)
        .returns(z.object({ name: z.string() }));

      expect(getRoute.responses?.[503]).toBe(customSchema);
      expect(getRoute.responses?.[404]).toBeDefined();
    });

    it('preserves immutability', () => {
      const base = route.get('/:id').returns(z.object({ name: z.string() }));
      const withError = base.withErrors(404);

      expect(base.responses).toBeUndefined();
      expect(withError.responses?.[404]).toBeDefined();
    });
  });

  describe('integration with OpenAPI spec generation', () => {
    const api = defineApi({
      v1: {
        children: {
          items: {
            routes: {
              get: route
                .get('/:id')
                .params(z.object({ id: z.string() }))
                .returns(z.object({ name: z.string() }))
                .withErrors(404, 401),
              teapot: route
                .get('/teapot')
                .withResponses({ 418: z.object({ error: z.string() }) })
                .returns(z.object({ ok: z.boolean() })),
            },
          },
        },
      },
    });
    const spec = generateSpec(api, { info: { title: 'Test', version: '1.0.0' } });

    it('documents error responses as application/problem+json with status text', () => {
      const responses = spec.paths['/v1/items/{id}']?.get?.responses;

      expect(responses?.['404']?.description).toBe('Not Found');
      expect(responses?.['401']?.description).toBe('Unauthorized');
      const schema = responses?.['404']?.content?.['application/problem+json']?.schema;
      expect(schema?.properties).toHaveProperty('type');
      expect(schema?.properties).toHaveProperty('title');
      expect(schema?.properties).toHaveProperty('status');
      expect(schema?.properties).toHaveProperty('code');
      expect(schema?.properties?.code).toMatchObject({ const: 'NOT_FOUND' });
      expect(responses?.['404']?.content?.['application/json']).toBeUndefined();
    });

    it('keeps custom non-problem schemas as application/json', () => {
      const responses = spec.paths['/v1/items/teapot']?.get?.responses;

      expect(responses?.['418']?.content?.['application/json']).toBeDefined();
      expect(responses?.['418']?.description).toBe('Response 418');
    });
  });
});
