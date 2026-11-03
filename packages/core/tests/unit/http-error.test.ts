import { describe, expect, it } from 'vitest';
import { HttpError, isHttpError } from '../../src/errors/http-error';
import { PROBLEM_CONTENT_TYPE } from '../../src/helpers/problem';

describe('HttpError', () => {
  it('builds a problem from the status', () => {
    const error = new HttpError(404);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('HttpError');
    expect(error.status).toBe(404);
    expect(error.message).toBe('Not Found');
    expect(error.problem).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('treats a string argument as the detail', () => {
    const error = new HttpError(404, 'Product 42 not found');

    expect(error.message).toBe('Product 42 not found');
    expect(error.problem.detail).toBe('Product 42 not found');
  });

  it('accepts problem members, headers and a cause', () => {
    const cause = new Error('db constraint');
    const error = new HttpError(409, {
      code: 'DUPLICATE_TITLE',
      detail: 'Title already exists',
      headers: { 'X-Conflict': 'title' },
      extensions: { field: 'title' },
      cause,
    });

    expect(error.problem).toMatchObject({ code: 'DUPLICATE_TITLE', field: 'title' });
    expect(error.problem).not.toHaveProperty('headers');
    expect(error.problem).not.toHaveProperty('cause');
    expect(error.headers).toEqual({ 'X-Conflict': 'title' });
    expect(error.cause).toBe(cause);
  });

  it.each([200, 399, 600, 404.5])('rejects status %s', (status) => {
    expect(() => new HttpError(status)).toThrow(RangeError);
  });

  it('serializes to the problem body', () => {
    const error = new HttpError(403, 'Admins only');

    expect(JSON.parse(JSON.stringify(error))).toEqual(error.problem);
  });

  it('converts to a problem Response with its headers', async () => {
    const response = new HttpError(429, { headers: { 'Retry-After': '30' } }).getResponse();

    expect(response.status).toBe(429);
    expect(response.headers.get('content-type')).toBe(PROBLEM_CONTENT_TYPE);
    expect(response.headers.get('retry-after')).toBe('30');
    expect(await response.json()).toMatchObject({ status: 429, code: 'RATE_LIMIT_EXCEEDED' });
  });
});

describe('isHttpError', () => {
  it('recognizes HttpError instances', () => {
    expect(isHttpError(new HttpError(400))).toBe(true);
  });

  it('recognizes errors branded by another copy of the library', () => {
    const foreign = Object.assign(new Error('x'), { status: 404 });
    Object.defineProperty(foreign, Symbol.for('typeful-api.HttpError'), { value: true });

    expect(isHttpError(foreign)).toBe(true);
  });

  it.each([new Error('x'), { status: 404 }, null, undefined, 'error'])('rejects %o', (value) => {
    expect(isHttpError(value)).toBe(false);
  });
});
