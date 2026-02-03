/**
 * @typi/core
 *
 * Framework-agnostic core library for building type-safe OpenAPI-first APIs.
 * Define your API contract once with Zod schemas, get full type inference
 * for handlers, and generate OpenAPI specs automatically.
 *
 * @example
 * ```ts
 * import { defineApi, route, generateSpec } from '@typi/core';
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

// Types
export type {
  ApiContract,
  AuthType,
  GenerateSpecOptions,
  HandlerFn,
  HttpMethod,
  InferBody,
  InferGroupHandlers,
  InferHandlers,
  InferParams,
  InferQuery,
  InferResponse,
  OpenApiInfo,
  OpenApiServer,
  RouteContext,
  RouteDefinition,
  RouteGroup,
  RouteLeaves,
  VersionedRoutes,
  WithContext,
} from './types';

