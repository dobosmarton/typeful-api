import { z, type ZodType } from 'zod';
import { fieldErrorSchema, problemSchema } from './problem';

/**
 * Supported HTTP error status codes for the `commonErrors()` and `withErrors()` helpers
 */
export type ErrorStatusCode = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500;

const fieldErrors = () =>
  z.array(fieldErrorSchema).optional().describe('Field-level problems, one per invalid value');

// Each schema documents the RFC 9457 Problem Details body adapters send for that status.
// The codes match what `new HttpError(status)` uses by default.

/** 400 Bad Request — malformed request (for example invalid JSON) */
export const badRequestError = () => problemSchema(400, 'BAD_REQUEST', { errors: fieldErrors() });

/** 401 Unauthorized — missing or invalid authentication */
export const unauthorizedError = () => problemSchema(401, 'UNAUTHORIZED');

/** 403 Forbidden — insufficient permissions */
export const forbiddenError = () => problemSchema(403, 'FORBIDDEN');

/** 404 Not Found — resource does not exist */
export const notFoundError = () => problemSchema(404, 'NOT_FOUND');

/** 409 Conflict — resource state conflict */
export const conflictError = () => problemSchema(409, 'CONFLICT');

/** 422 Unprocessable Content — request validation failed; `errors` lists each problem */
export const unprocessableError = () =>
  problemSchema(422, 'VALIDATION_FAILED', { errors: fieldErrors() });

/** 429 Too Many Requests — rate limit exceeded */
export const rateLimitError = () => problemSchema(429, 'RATE_LIMIT_EXCEEDED');

/** 500 Internal Server Error */
export const internalError = () => problemSchema(500, 'INTERNAL_ERROR');

/**
 * Map of HTTP status codes to their error schema factories.
 */
const errorFactories = {
  400: badRequestError,
  401: unauthorizedError,
  403: forbiddenError,
  404: notFoundError,
  409: conflictError,
  422: unprocessableError,
  429: rateLimitError,
  500: internalError,
} as const satisfies Record<ErrorStatusCode, () => ZodType>;

/**
 * The schema type `withErrors()` / `commonErrors()` registers for a status code
 */
export type ErrorSchemaFor<C extends ErrorStatusCode> = ReturnType<(typeof errorFactories)[C]>;

/**
 * Status code → schema map for a set of error status codes
 */
export type ErrorSchemas<C extends ErrorStatusCode> = { [K in C]: ErrorSchemaFor<K> };

/**
 * Creates a record of error response schemas keyed by HTTP status code.
 * The returned type is compatible with `.withResponses()` on the route builder.
 *
 * @example
 * ```ts
 * // Use with .withResponses():
 * route.get('/:id')
 *   .params(IdSchema)
 *   .withResponses(commonErrors(404, 401))
 *   .returns(ProductSchema)
 *
 * // Or use the .withErrors() shorthand:
 * route.get('/:id')
 *   .params(IdSchema)
 *   .returns(ProductSchema)
 *   .withErrors(404, 401)
 * ```
 */
export const commonErrors = <const C extends readonly ErrorStatusCode[]>(
  ...codes: C
): ErrorSchemas<C[number]> => {
  return Object.fromEntries(
    codes.filter((code) => code in errorFactories).map((code) => [code, errorFactories[code]()]),
  ) as ErrorSchemas<C[number]>;
};
