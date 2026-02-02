import type { NextFunction, Request, Response, RequestHandler } from 'express';
import type {
  ApiContract,
  InferBody,
  InferParams,
  InferQuery,
  InferResponse,
  RouteDefinition,
  RouteGroup,
} from '@typi/core';

/**
 * Extended Express Request with typed body, query, and params
 */
export type TypedRequest<R extends RouteDefinition> = Request<
  InferParams<R>,
  InferResponse<R>,
  InferBody<R>,
  InferQuery<R>
>;

/**
 * Extended Express Response with typed json method
 */
export type TypedResponse<R extends RouteDefinition> = Response<InferResponse<R>>;

/**
 * Handler context for Express routes
 */
export type ExpressRouteContext<R extends RouteDefinition> = {
  req: TypedRequest<R>;
  res: TypedResponse<R>;
  body: InferBody<R>;
  query: InferQuery<R>;
  params: InferParams<R>;
};

/**
 * Handler function type for Express routes
 */
export type ExpressHandler<R extends RouteDefinition> = (
  ctx: ExpressRouteContext<R>,
) => Promise<InferResponse<R>> | InferResponse<R>;

/**
 * Recursively infer handler types from a route group for Express
 */
export type InferExpressGroupHandlers<G extends RouteGroup> =
  (G['routes'] extends Record<string, RouteDefinition>
    ? {
        [K in keyof G['routes']]: ExpressHandler<G['routes'][K]>;
      }
    : object) &
    (G['children'] extends Record<string, RouteGroup>
      ? {
          [K in keyof G['children']]: InferExpressGroupHandlers<
            G['children'][K]
          >;
        }
      : object);

/**
 * Infer all handlers from an API contract for Express
 */
export type InferExpressHandlers<C extends ApiContract> = {
  [VK in keyof C]: {
    middleware?: RequestHandler[];
  } & (C[VK]['children'] extends Record<string, RouteGroup>
    ? {
        [CK in keyof C[VK]['children']]: InferExpressGroupHandlers<
          C[VK]['children'][CK]
        > & {
          middleware?: RequestHandler[];
        };
      }
    : object);
};

/**
 * Options for creating an Express router
 */
export type CreateExpressRouterOptions = {
  /**
   * Global middleware applied to all routes
   */
  middleware?: RequestHandler[];

  /**
   * Whether to validate request bodies against Zod schemas
   * @default true
   */
  validateBody?: boolean;

  /**
   * Whether to validate query parameters against Zod schemas
   * @default true
   */
  validateQuery?: boolean;

  /**
   * Whether to validate path parameters against Zod schemas
   * @default true
   */
  validateParams?: boolean;

  /**
   * Custom error handler for validation errors
   */
  onValidationError?: (
    error: ValidationError,
    req: Request,
    res: Response,
    next: NextFunction,
  ) => void;
};

/**
 * Validation error structure
 */
export type ValidationError = {
  type: 'body' | 'query' | 'params';
  errors: Array<{
    path: string[];
    message: string;
  }>;
};

/**
 * Extended request locals for typed middleware
 */
export type RequestLocals<T = unknown> = {
  locals: T;
};

/**
 * Helper type to extend Request with custom locals
 */
export type WithLocals<T> = Request & RequestLocals<T>;
