/**
 * @typeful-api/core/client
 *
 * Typed HTTP client inferred from an API contract. Import the same contract you use on the
 * server; no code generation step is needed.
 *
 * @packageDocumentation
 */

export { createClient } from './create-client';
export {
  createSpecClient,
  type SpecArgs,
  type SpecCaller,
  type SpecClient,
  type SpecClientOptions,
  type SpecResponse,
  type SpecRoute,
  type SpecRoutes,
} from './spec-client';
export {
  ResponseError,
  ResponseValidationError,
  UnexpectedResponseError,
  isResponseError,
  unwrap,
} from './errors';
export type {
  ClientOptions,
  ClientResponse,
  ContractClient,
  InferClientArgs,
  InferClientBody,
  InferClientResponse,
  RequestOptions,
  RouteArgs,
  RouteCaller,
} from './types';
export type { FieldError, ProblemDetails } from '../helpers/problem';
