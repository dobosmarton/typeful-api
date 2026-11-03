import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  PROBLEM_CONTENT_TYPE,
  createProblem,
  problemResponse,
  problemSchema,
} from '../../src/helpers/problem';

describe('createProblem', () => {
  it('fills in type, title and code from the status', () => {
    expect(createProblem(404)).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('uses VALIDATION_FAILED as the default 422 code', () => {
    expect(createProblem(422)).toMatchObject({
      title: 'Unprocessable Content',
      code: 'VALIDATION_FAILED',
    });
  });

  it('falls back to a generic title and HTTP_<status> code for unknown statuses', () => {
    expect(createProblem(418)).toMatchObject({ title: 'Client Error', code: 'HTTP_418' });
    expect(createProblem(599)).toMatchObject({ title: 'Server Error', code: 'HTTP_599' });
  });

  it('includes optional members only when set', () => {
    const problem = createProblem(404, {
      detail: 'Product 42 not found',
      instance: '/products/42',
      errors: [{ location: 'params', path: ['id'], message: 'Invalid' }],
    });

    expect(problem).toMatchObject({ detail: 'Product 42 not found', instance: '/products/42' });
    expect(problem.errors).toHaveLength(1);
    expect(createProblem(404)).not.toHaveProperty('detail');
  });

  it('lets explicit members override the defaults', () => {
    expect(
      createProblem(409, {
        type: 'https://example.com/problems/duplicate',
        title: 'Duplicate title',
        code: 'DUPLICATE_TITLE',
      }),
    ).toMatchObject({
      type: 'https://example.com/problems/duplicate',
      title: 'Duplicate title',
      code: 'DUPLICATE_TITLE',
    });
  });

  it('adds extension members but never lets them replace standard members', () => {
    const problem = createProblem(429, {
      extensions: { retryAfter: 30, status: 200, code: 'HIJACK' },
    });

    expect(problem).toMatchObject({ retryAfter: 30, status: 429, code: 'RATE_LIMIT_EXCEEDED' });
  });
});

describe('problemResponse', () => {
  it('builds an application/problem+json Response with the problem status', async () => {
    const response = problemResponse(createProblem(404, { detail: 'Missing' }), {
      'X-Request-Id': 'abc',
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe(PROBLEM_CONTENT_TYPE);
    expect(response.headers.get('x-request-id')).toBe('abc');
    expect(await response.json()).toMatchObject({ status: 404, detail: 'Missing' });
  });

  it('does not let headers override the content type', () => {
    const response = problemResponse(createProblem(400), { 'content-type': 'text/plain' });

    expect(response.headers.get('content-type')).toBe(PROBLEM_CONTENT_TYPE);
  });
});

describe('problemSchema', () => {
  it('validates a problem with a literal status and code', () => {
    const schema = problemSchema(409, 'DUPLICATE_TITLE');

    expect(schema.safeParse(createProblem(409, { code: 'DUPLICATE_TITLE' })).success).toBe(true);
    expect(schema.safeParse(createProblem(409)).success).toBe(false);
  });

  it('supports extension members', () => {
    const schema = problemSchema(409, 'OUT_OF_STOCK', { available: z.number() });
    const valid = createProblem(409, { code: 'OUT_OF_STOCK', extensions: { available: 3 } });

    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse({ ...valid, available: 'three' }).success).toBe(false);
  });
});
