import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  errorSchema,
  badRequestError,
  unauthorizedError,
  forbiddenError,
  notFoundError,
  conflictError,
  unprocessableError,
  rateLimitError,
  internalError,
  commonErrors,
} from '../../src/helpers/errors';
import { route } from '../../src/route';
import { defineApi } from '../../src/contract';
import { generateSpec } from '../../src/spec';

describe('error helpers', () => {
  describe('errorSchema', () => {
    it('creates a schema with a literal code', () => {
      const schema = errorSchema('CUSTOM_ERROR');
      const result = schema.parse({ code: 'CUSTOM_ERROR', message: 'Something went wrong' });
      expect(result.code).toBe('CUSTOM_ERROR');
      expect(result.message).toBe('Something went wrong');
    });

    it('rejects non-matching code', () => {
      const schema = errorSchema('CUSTOM_ERROR');
      const result = schema.safeParse({ code: 'WRONG_CODE', message: 'test' });
      expect(result.success).toBe(false);
    });

    it('requires message field', () => {
      const schema = errorSchema('ERROR');
      const result = schema.safeParse({ code: 'ERROR' });
      expect(result.success).toBe(false);
    });

    it('creates a schema with details when provided', () => {
      const schema = errorSchema('VALIDATION', 'Validation failed', {
        details: z.array(z.object({ field: z.string(), message: z.string() })),
      });
      const result = schema.parse({
        code: 'VALIDATION',
        message: 'Validation failed',
        details: [{ field: 'name', message: 'required' }],
      });
      expect(result.code).toBe('VALIDATION');
      expect(result.details).toHaveLength(1);
    });

    it('details field is optional', () => {
      const schema = errorSchema('ERROR', 'msg', {
        details: z.string(),
      });
      const result = schema.parse({ code: 'ERROR', message: 'msg' });
      expect(result.code).toBe('ERROR');
    });
  });

  describe('pre-built error schemas', () => {
    it('badRequestError has BAD_REQUEST code', () => {
      const schema = badRequestError();
      const result = schema.parse({
        code: 'BAD_REQUEST',
        message: 'Invalid input',
        details: [{ field: 'email', message: 'invalid format' }],
      });
      expect(result.code).toBe('BAD_REQUEST');
    });

    it('badRequestError details are optional', () => {
      const schema = badRequestError();
      const result = schema.parse({ code: 'BAD_REQUEST', message: 'Bad' });
      expect(result.code).toBe('BAD_REQUEST');
    });

    it('unauthorizedError has UNAUTHORIZED code', () => {
      const schema = unauthorizedError();
      const result = schema.parse({ code: 'UNAUTHORIZED', message: 'Not logged in' });
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('forbiddenError has FORBIDDEN code', () => {
      const schema = forbiddenError();
      const result = schema.parse({ code: 'FORBIDDEN', message: 'No access' });
      expect(result.code).toBe('FORBIDDEN');
    });

    it('notFoundError has NOT_FOUND code', () => {
      const schema = notFoundError();
      const result = schema.parse({ code: 'NOT_FOUND', message: 'Missing' });
      expect(result.code).toBe('NOT_FOUND');
    });

    it('conflictError has CONFLICT code', () => {
      const schema = conflictError();
      const result = schema.parse({ code: 'CONFLICT', message: 'Already exists' });
      expect(result.code).toBe('CONFLICT');
    });

    it('unprocessableError has UNPROCESSABLE_ENTITY code', () => {
      const schema = unprocessableError();
      const result = schema.parse({ code: 'UNPROCESSABLE_ENTITY', message: 'Invalid' });
      expect(result.code).toBe('UNPROCESSABLE_ENTITY');
    });

    it('rateLimitError has RATE_LIMIT_EXCEEDED code', () => {
      const schema = rateLimitError();
      const result = schema.parse({ code: 'RATE_LIMIT_EXCEEDED', message: 'Slow down' });
      expect(result.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('internalError has INTERNAL_ERROR code', () => {
      const schema = internalError();
      const result = schema.parse({ code: 'INTERNAL_ERROR', message: 'Oops' });
      expect(result.code).toBe('INTERNAL_ERROR');
    });

    it('each call returns a fresh schema instance', () => {
      const schema1 = notFoundError();
      const schema2 = notFoundError();
      expect(schema1).not.toBe(schema2);
    });
  });

  describe('commonErrors', () => {
    it('returns schemas keyed by status code', () => {
      const errors = commonErrors(404, 401);
      expect(errors[404]).toBeDefined();
      expect(errors[401]).toBeDefined();
      expect(errors[500]).toBeUndefined();
    });

    it('returns empty record for no codes', () => {
      const errors = commonErrors();
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it('maps all supported codes', () => {
      const errors = commonErrors(400, 401, 403, 404, 409, 422, 429, 500);
      expect(Object.keys(errors)).toHaveLength(8);
    });

    it('schemas are valid Zod schemas', () => {
      const errors = commonErrors(404);
      const result = errors[404]!.safeParse({
        code: 'NOT_FOUND',
        message: 'Not found',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('withErrors on route builder', () => {
    it('adds error responses via FinalRoute (after .returns())', () => {
      const getRoute = route
        .get('/:id')
        .params(z.object({ id: z.string() }))
        .returns(z.object({ name: z.string() }))
        .withErrors(404, 401);

      expect(getRoute.responses).toBeDefined();
      expect(getRoute.responses![404]).toBeDefined();
      expect(getRoute.responses![401]).toBeDefined();
    });

    it('adds error responses via RouteBuilder (before .returns())', () => {
      const getRoute = route
        .get('/:id')
        .params(z.object({ id: z.string() }))
        .withErrors(404)
        .returns(z.object({ name: z.string() }));

      expect(getRoute.responses).toBeDefined();
      expect(getRoute.responses![404]).toBeDefined();
    });

    it('merges with existing withResponses', () => {
      const customSchema = z.object({ error: z.string() });
      const getRoute = route
        .get('/:id')
        .withResponses({ 503: customSchema })
        .withErrors(404)
        .returns(z.object({ name: z.string() }));

      expect(getRoute.responses![503]).toBeDefined();
      expect(getRoute.responses![404]).toBeDefined();
    });

    it('preserves immutability', () => {
      const base = route.get('/:id').returns(z.object({ name: z.string() }));

      const withError = base.withErrors(404);

      expect(base.responses).toBeUndefined();
      expect(withError.responses![404]).toBeDefined();
    });
  });

  describe('integration with OpenAPI spec generation', () => {
    it('generates error responses in OpenAPI spec', () => {
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
              },
            },
          },
        },
      });

      const spec = generateSpec(api, {
        info: { title: 'Test', version: '1.0.0' },
      });

      const operation = spec.paths['/v1/items/{id}']?.get;
      expect(operation).toBeDefined();

      // Check 200 success response
      expect(operation?.responses['200']).toBeDefined();

      // Check error responses
      expect(operation?.responses['404']).toBeDefined();
      expect(operation?.responses['401']).toBeDefined();

      // Check descriptions use HTTP status text
      expect(operation?.responses['404'].description).toBe('Not Found');
      expect(operation?.responses['401'].description).toBe('Unauthorized');

      // Check error schema has code property in JSON Schema
      const errorSchema404 = operation?.responses['404']?.content?.['application/json']?.schema;
      expect(errorSchema404?.properties).toHaveProperty('code');
      expect(errorSchema404?.properties).toHaveProperty('message');
    });

    it('uses fallback description for unknown status codes', () => {
      const api = defineApi({
        v1: {
          routes: {
            test: route
              .get('/test')
              .withResponses({
                418: z.object({ error: z.string() }),
              })
              .returns(z.object({ ok: z.boolean() })),
          },
        },
      });

      const spec = generateSpec(api, {
        info: { title: 'Test', version: '1.0.0' },
      });

      const operation = spec.paths['/v1/test']?.get;
      expect(operation?.responses['418'].description).toBe('Response 418');
    });
  });
});
