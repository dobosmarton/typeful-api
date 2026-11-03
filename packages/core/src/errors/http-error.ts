import {
  createProblem,
  problemResponse,
  type ProblemDetails,
  type ProblemInit,
} from '../helpers/problem';

/**
 * Registered (global) symbol, so `isHttpError` also recognizes errors created by another copy
 * of `@typeful-api/core` (e.g. when a project ends up with two versions installed).
 */
const HTTP_ERROR_BRAND = Symbol.for('typeful-api.HttpError');

/**
 * Options for an `HttpError`: Problem Details members plus response headers
 */
export type HttpErrorInit = ProblemInit & {
  /** Extra response headers, e.g. `{ 'Retry-After': '30' }` */
  headers?: Record<string, string>;
  /** The underlying error, kept for logging; never sent to the client */
  cause?: unknown;
};

/**
 * An error that adapters turn into an RFC 9457 Problem Details response.
 *
 * Throw it from handlers or middleware. Other thrown errors are left to the framework's (or
 * your) error handler.
 *
 * @example
 * ```ts
 * throw new HttpError(404, 'Product not found');
 * throw new HttpError(409, { code: 'DUPLICATE_TITLE', detail: 'Title already exists' });
 * throw new HttpError(429, { headers: { 'Retry-After': '30' } });
 * ```
 */
export class HttpError extends Error {
  /** HTTP status code (400-599) */
  readonly status: number;
  /** Extra response headers */
  readonly headers: Readonly<Record<string, string>>;
  /** The Problem Details body that is sent */
  readonly problem: ProblemDetails;

  constructor(status: number, init: string | HttpErrorInit = {}) {
    if (!Number.isInteger(status) || status < 400 || status > 599) {
      throw new RangeError(`HttpError status must be an integer from 400 to 599, got ${status}`);
    }
    const { headers, cause, ...problemInit } = typeof init === 'string' ? { detail: init } : init;
    const problem = createProblem(status, problemInit);

    super(problem.detail ?? problem.title, cause === undefined ? undefined : { cause });
    this.name = 'HttpError';
    this.status = status;
    this.headers = { ...headers };
    this.problem = problem;
    Object.defineProperty(this, HTTP_ERROR_BRAND, { value: true });
  }

  /**
   * The Problem Details body, so `JSON.stringify(error)` produces the response body
   */
  toJSON(): ProblemDetails {
    return this.problem;
  }

  /**
   * The error as a web-standard `Response`. Hono's default error handler calls this.
   */
  getResponse(): Response {
    return problemResponse(this.problem, { ...this.headers });
  }
}

/**
 * Whether a value is an `HttpError`, including one created by another copy of the library
 */
export const isHttpError = (value: unknown): value is HttpError =>
  value instanceof HttpError ||
  (typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[HTTP_ERROR_BRAND] === true);
