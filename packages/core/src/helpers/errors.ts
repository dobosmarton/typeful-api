import { z, type ZodType } from 'zod';

/**
 * Supported HTTP error status codes for the `commonErrors()` and `withErrors()` helpers
 */
export type ErrorStatusCode = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500;

/**
 * Options for custom error schema creation
 */
type ErrorSchemaOptions = {
  /** Schema for additional error details */
  details?: ZodType;
};

/**
 * Creates a standard error response schema with a literal error code.
 * Using `z.literal()` for the code field enables discriminated unions
 * in generated client types and precise `enum` values in OpenAPI specs.
 *
 * @example
 * ```ts
 * const NotFoundSchema = errorSchema('NOT_FOUND', 'Resource not found');
 * // { code: 'NOT_FOUND', message: string }
 *
 * const ValidationSchema = errorSchema('VALIDATION_ERROR', 'Invalid input', {
 *   details: z.array(z.object({ field: z.string(), message: z.string() })),
 * });
 * // { code: 'VALIDATION_ERROR', message: string, details?: [...] }
 * ```
 */
export const errorSchema = <TCode extends string>(
  code: TCode,
  defaultMessage?: string,
  options?: ErrorSchemaOptions,
) => {
  const base = {
    code: z.literal(code).describe('Machine-readable error code'),
    message: z
      .string()
      .describe(defaultMessage ?? 'Human-readable error message'),
  };

  if (options?.details) {
    return z.object({
      ...base,
      details: options.details.optional().describe('Additional error details'),
    });
  }

  return z.object(base);
};

/** 400 Bad Request — validation or malformed request */
export const badRequestError = () =>
  errorSchema('BAD_REQUEST', 'Bad request', {
    details: z.array(
      z.object({
        field: z.string().optional().describe('Field that failed validation'),
        message: z.string().describe('Validation error message'),
      }),
    ),
  });

/** 401 Unauthorized — missing or invalid authentication */
export const unauthorizedError = () =>
  errorSchema('UNAUTHORIZED', 'Authentication required');

/** 403 Forbidden — insufficient permissions */
export const forbiddenError = () =>
  errorSchema('FORBIDDEN', 'Insufficient permissions');

/** 404 Not Found — resource does not exist */
export const notFoundError = () =>
  errorSchema('NOT_FOUND', 'Resource not found');

/** 409 Conflict — resource state conflict */
export const conflictError = () =>
  errorSchema('CONFLICT', 'Resource conflict');

/** 422 Unprocessable Entity — semantically invalid request */
export const unprocessableError = () =>
  errorSchema('UNPROCESSABLE_ENTITY', 'Unprocessable entity');

/** 429 Too Many Requests — rate limit exceeded */
export const rateLimitError = () =>
  errorSchema('RATE_LIMIT_EXCEEDED', 'Too many requests');

/** 500 Internal Server Error */
export const internalError = () =>
  errorSchema('INTERNAL_ERROR', 'Internal server error');

/**
 * Map of HTTP status codes to their error schema factories.
 */
const errorFactories: Record<ErrorStatusCode, () => ZodType> = {
  400: badRequestError,
  401: unauthorizedError,
  403: forbiddenError,
  404: notFoundError,
  409: conflictError,
  422: unprocessableError,
  429: rateLimitError,
  500: internalError,
};

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
export const commonErrors = (
  ...codes: ErrorStatusCode[]
): Record<number, ZodType> => {
  return Object.fromEntries(
    codes
      .filter((code) => code in errorFactories)
      .map((code) => [code, errorFactories[code]!()]),
  );
};
