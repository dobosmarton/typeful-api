import type { z } from 'zod';
import type { ProblemDetails } from '../helpers/problem';

type ResponseParts = { status: number; body: unknown; headers: Headers };

const isProblem = (body: unknown): body is ProblemDetails =>
  typeof body === 'object' &&
  body !== null &&
  typeof (body as Record<string, unknown>).status === 'number' &&
  typeof (body as Record<string, unknown>).title === 'string';

const describe = ({ status, body }: ResponseParts): string => {
  if (!isProblem(body)) return `Request failed with status ${status}`;
  return body.detail ? `${status} ${body.title}: ${body.detail}` : `${status} ${body.title}`;
};

/**
 * A response the caller did not expect, with its status, parsed body and headers
 */
export class ResponseError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Headers;
  /** The body, when it is an RFC 9457 Problem Details object */
  readonly problem: ProblemDetails | undefined;

  constructor(response: ResponseParts, message = describe(response), options?: ErrorOptions) {
    super(message, options);
    this.name = 'ResponseError';
    this.status = response.status;
    this.body = response.body;
    this.headers = response.headers;
    this.problem = isProblem(response.body) ? response.body : undefined;
  }
}

/**
 * The server answered with a status the contract does not declare for the route (for example
 * a 500 from an unhandled error), or with a body that is not valid JSON
 */
export class UnexpectedResponseError extends ResponseError {
  constructor(response: ResponseParts, message?: string, options?: ErrorOptions) {
    super(response, message ?? `Unexpected ${response.status} response`, options);
    this.name = 'UnexpectedResponseError';
  }
}

/**
 * With `validateResponse`, the response body does not match the route's schema
 */
export class ResponseValidationError extends ResponseError {
  readonly issues: z.core.$ZodIssue[];

  constructor(response: ResponseParts, error: z.ZodError) {
    super(response, `${response.status} response does not match the contract`, { cause: error });
    this.name = 'ResponseValidationError';
    this.issues = error.issues;
  }
}

/**
 * Whether a value is one of the client's response errors
 */
export const isResponseError = (value: unknown): value is ResponseError =>
  value instanceof ResponseError;

/**
 * Returns the body of a 200 response and throws a `ResponseError` for any other status.
 * Handy with data-fetching libraries that expect a value or a thrown error.
 *
 * @example
 * ```ts
 * const product = await client.v1.products.get({ params: { id } }).then(unwrap);
 * ```
 */
export const unwrap = <R extends { status: number; body: unknown; headers: Headers }>(
  response: R,
): Extract<R, { status: 200 }>['body'] => {
  if (response.status !== 200) throw new ResponseError(response);
  return response.body as Extract<R, { status: 200 }>['body'];
};
