import type { ZodError } from 'zod';
import {
  createProblem,
  type FieldError,
  type ProblemDetails,
  type RequestLocation,
} from '../helpers/problem';

/**
 * A failed request validation, as passed to an adapter's `onValidationError` option
 */
export type ValidationError = {
  /** Part of the request that failed validation */
  type: RequestLocation;
  /** Field-level problems */
  errors: FieldError[];
  /** The 422 Problem Details body adapters send by default */
  problem: ProblemDetails;
  /** The original Zod error */
  cause: ZodError;
};

const details: Record<RequestLocation, string> = {
  body: 'Invalid request body',
  query: 'Invalid query parameters',
  params: 'Invalid path parameters',
};

/**
 * Turns a Zod error for one part of the request into a `ValidationError` with a ready-to-send
 * 422 problem. For adapter authors.
 */
export const toValidationError = (location: RequestLocation, error: ZodError): ValidationError => {
  const errors = error.issues.map((issue) => ({
    location,
    path: issue.path.map((key) => (typeof key === 'symbol' ? key.toString() : key)),
    message: issue.message,
  }));

  return {
    type: location,
    errors,
    problem: createProblem(422, { detail: details[location], errors }),
    cause: error,
  };
};
