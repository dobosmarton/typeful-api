/**
 * @typeful-api/core
 *
 * Framework-agnostic core library for building type-safe OpenAPI-first APIs.
 * Define your API contract once with Zod schemas, get full type inference
 * for handlers, and generate OpenAPI specs automatically.
 *
 * @example
 * ```ts
 * import { defineApi, route, generateSpec } from '@typeful-api/core';
 * import { z } from 'zod';
 *
 * // Define schemas
 * const ProductSchema = z.object({
 *   id: z.uuid(),
 *   name: z.string(),
 *   price: z.number(),
 * });
 *
 * // Define API contract
 * export const api = defineApi({
 *   v1: {
 *     children: {
 *       products: {
 *         routes: {
 *           list: route.get('/').returns(z.array(ProductSchema)),
 *           get: route.get('/:id')
 *             .params(z.object({ id: z.uuid() }))
 *             .returns(ProductSchema),
 *         },
 *       },
 *     },
 *   },
 * });
 *
 * // Generate OpenAPI spec
 * const spec = generateSpec(api, {
 *   info: { title: 'My API', version: '1.0.0' },
 * });
 * ```
 *
 * @packageDocumentation
 */

// Route builder
export { route } from './route';
export type {
  FinalRoute,
  InitialRouteState,
  MergeResponses,
  RouteBuilder,
  RouteState,
  WithRouteState,
} from './route';

// Contract definition helpers
export {
  defineApi,
  defineGroup,
  defineRoutes,
  defineVersions,
  extractTags,
  flattenRoutes,
  isRouteDefinition,
  isRouteGroup,
} from './contract';

// Spec generation
export { generateSpec, generateSpecJson, type OpenApiDocument } from './spec';
export { TYPEFUL_ROUTE_EXTENSION, convertPathParams } from './path';

// Types
export type {
  ApiContract,
  AuthType,
  GenerateSpecOptions,
  HandlerFn,
  HandlerResult,
  HttpMethod,
  InferBody,
  InferBodyInput,
  InferGroupHandlers,
  InferHandlers,
  InferParams,
  InferParamsInput,
  InferQuery,
  InferQueryInput,
  InferResponse,
  OpenApiInfo,
  OpenApiServer,
  RouteContext,
  RouteDefinition,
  RouteExample,
  RouteExamples,
  RouteGroup,
  WithResponseHeaders,
  RouteLeaves,
  VersionedRoutes,
  WithContext,
} from './types';

// Pagination & filtering helpers
export {
  paginationQuery,
  cursorQuery,
  sortQuery,
  paginated,
  cursorPaginated,
} from './helpers/pagination';

// Auth types and helpers
export type { AuthConfig, AuthCredentials, AuthVerifyFn } from './auth';
export { extractBearerToken, extractApiKey, extractBasicCredentials } from './helpers/auth';

// Response header helpers
export { withHeaders, isWithHeaders } from './helpers/headers';

// Errors and RFC 9457 Problem Details
export { HttpError, isHttpError, type HttpErrorInit } from './errors/http-error';
export {
  PROBLEM_CONTENT_TYPE,
  createProblem,
  fieldErrorSchema,
  problemResponse,
  problemSchema,
  type FieldError,
  type ProblemDetails,
  type ProblemInit,
  type RequestLocation,
} from './helpers/problem';

// For adapter authors: shared request handling used by the official adapters
export {
  isProblemSchema,
  resolveRouteResponses,
  routeHasInput,
  routeRequiresAuth,
  type ResolvedResponse,
} from './responses';
export { toValidationError, type ValidationError } from './server/validation';
export {
  createAuthenticator,
  type AuthResult,
  type Authenticator,
  type HeaderReader,
} from './server/authenticate';

// Error response schemas
export {
  badRequestError,
  unauthorizedError,
  forbiddenError,
  notFoundError,
  conflictError,
  unprocessableError,
  rateLimitError,
  internalError,
  commonErrors,
  type ErrorSchemaFor,
  type ErrorSchemas,
  type ErrorStatusCode,
} from './helpers/errors';
