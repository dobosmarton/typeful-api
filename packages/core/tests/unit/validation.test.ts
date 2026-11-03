import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toValidationError } from '../../src/server/validation';

const failure = (schema: z.ZodType, value: unknown) => {
  const result = schema.safeParse(value);
  if (result.success) throw new Error('expected a validation failure');
  return result.error;
};

describe('toValidationError', () => {
  it('maps each issue to a field error with its location', () => {
    const error = failure(z.object({ name: z.string(), tags: z.array(z.string()) }), {
      tags: ['ok', 1],
    });

    const validation = toValidationError('body', error);

    expect(validation.type).toBe('body');
    expect(validation.errors).toEqual([
      { location: 'body', path: ['name'], message: expect.any(String) },
      { location: 'body', path: ['tags', 1], message: expect.any(String) },
    ]);
    expect(validation.cause).toBe(error);
  });

  it('builds a 422 VALIDATION_FAILED problem with a detail per location', () => {
    const error = failure(z.object({ id: z.uuid() }), { id: 'nope' });

    expect(toValidationError('params', error).problem).toMatchObject({
      type: 'about:blank',
      title: 'Unprocessable Content',
      status: 422,
      code: 'VALIDATION_FAILED',
      detail: 'Invalid path parameters',
      errors: [{ location: 'params', path: ['id'] }],
    });
    expect(toValidationError('query', error).problem.detail).toBe('Invalid query parameters');
    expect(toValidationError('body', error).problem.detail).toBe('Invalid request body');
  });

  it('converts symbol path keys to strings', () => {
    const key = Symbol('meta');
    const error = new z.ZodError([{ code: 'custom', path: [key], message: 'bad', input: 1 }]);

    expect(toValidationError('body', error).errors[0]?.path).toEqual(['Symbol(meta)']);
  });
});
