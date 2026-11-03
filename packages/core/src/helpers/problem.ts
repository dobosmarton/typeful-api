import { z } from 'zod';
import { defaultCode, statusText } from './status';

/**
 * Media type of RFC 9457 Problem Details responses
 */
export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/**
 * Part of the request a validation problem refers to
 */
export type RequestLocation = 'body' | 'query' | 'params';

/**
 * Schema of one entry in a problem's `errors` list
 */
export const fieldErrorSchema = z.object({
  location: z
    .enum(['body', 'query', 'params'])
    .describe('Part of the request that failed validation'),
  path: z.array(z.union([z.string(), z.number()])).describe('Path to the invalid value'),
  message: z.string().describe('What is wrong with the value'),
});

/**
 * One field-level problem, e.g. `{ location: 'body', path: ['name'], message: 'Required' }`
 */
export type FieldError = z.infer<typeof fieldErrorSchema>;

/**
 * RFC 9457 Problem Details body as sent by typeful-api.
 *
 * `type`, `title`, `status`, `detail` and `instance` are the RFC members. `code` is an
 * extension member with a stable machine-readable value, and `errors` lists field-level
 * problems for validation failures. Further extension members are allowed.
 */
export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: string;
  errors?: FieldError[];
  [extension: string]: unknown;
};

/**
 * Optional members of a problem; anything not set gets a sensible default
 */
export type ProblemInit = {
  /** Human-readable explanation of this occurrence */
  detail?: string;
  /** Short summary of the problem type. Defaults to the status reason phrase */
  title?: string;
  /** URI reference identifying the problem type. Defaults to `about:blank` */
  type?: string;
  /** URI reference identifying this occurrence */
  instance?: string;
  /** Machine-readable code. Defaults to one derived from the status, e.g. `NOT_FOUND` */
  code?: string;
  /** Field-level problems */
  errors?: FieldError[];
  /** Additional extension members; the standard members above take precedence */
  extensions?: Record<string, unknown>;
};

/**
 * Builds a Problem Details schema for documenting an error response.
 *
 * The `status` and `code` are literal types, so clients can narrow on them. Unknown extension
 * members are kept, as RFC 9457 allows them.
 *
 * @example
 * ```ts
 * const DuplicateTitle = problemSchema(409, 'DUPLICATE_TITLE');
 * route.post('/').body(Input).returns(Product).withResponses({ 409: DuplicateTitle });
 *
 * // With extension members
 * const OutOfStock = problemSchema(409, 'OUT_OF_STOCK', { available: z.number() });
 * ```
 */
export const problemSchema = <
  const TStatus extends number,
  const TCode extends string,
  TExtension extends z.ZodRawShape = Record<never, never>,
>(
  status: TStatus,
  code: TCode,
  extension?: TExtension,
) =>
  z.looseObject({
    type: z.string().describe('URI reference identifying the problem type'),
    title: z.string().describe('Short, human-readable summary of the problem type'),
    status: z.literal(status).describe('HTTP status code'),
    detail: z.string().optional().describe('Human-readable explanation of this occurrence'),
    instance: z.string().optional().describe('URI reference identifying this occurrence'),
    code: z.literal(code).describe('Machine-readable error code'),
    ...(extension ?? ({} as TExtension)),
  });

/**
 * Builds a Problem Details body, filling in `type`, `title` and `code` from the status
 */
export const createProblem = (status: number, init: ProblemInit = {}): ProblemDetails => {
  const { detail, title, type, instance, code, errors, extensions } = init;

  return {
    ...extensions,
    type: type ?? 'about:blank',
    title: title ?? statusText(status) ?? (status >= 500 ? 'Server Error' : 'Client Error'),
    status,
    code: code ?? defaultCode(status),
    ...(detail !== undefined && { detail }),
    ...(instance !== undefined && { instance }),
    ...(errors !== undefined && { errors }),
  };
};

/**
 * Wraps a problem in a web-standard `Response` with the `application/problem+json` type
 */
export const problemResponse = (
  problem: ProblemDetails,
  headers: Record<string, string> = {},
): Response =>
  new Response(JSON.stringify(problem), {
    status: problem.status,
    headers: { ...headers, 'content-type': PROBLEM_CONTENT_TYPE },
  });
