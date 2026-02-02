import type { Context, Env, MiddlewareHandler } from 'hono';
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
 * Compose Hono environment types with additional variables
 * This pattern allows layering context variables from middleware
 *
 * @example
 * ```ts
 * type WithDb = WithVariables<BaseEnv, { db: Database }>;
 * type WithAuth = WithVariables<WithDb, { user: User }>;
 * // WithAuth.Variables now has { db, user }
 * ```
 */
export type WithVariables<T, K = undefined> = T extends {
  Bindings: infer B;
}
  ? {
      Bindings: B;
      Variables: T extends { Variables: infer V } ? V & K : K;
    }
  : T & {
      Variables: K;
    };

/**
 * Handler context for a specific route in Hono
 */
export type HonoRouteContext<R extends RouteDefinition, E extends Env> = {
  c: Context<E>;
  body: InferBody<R>;
  query: InferQuery<R>;
  params: InferParams<R>;
};

/**
 * Handler function type for Hono routes
 */
export type HonoHandler<R extends RouteDefinition, E extends Env> = (
  ctx: HonoRouteContext<R, E>,
) => Promise<InferResponse<R>> | InferResponse<R>;

/**
 * Recursively infer handler types from a route group for Hono
 */
export type InferHonoGroupHandlers<G extends RouteGroup, E extends Env> =
  (G['routes'] extends Record<string, RouteDefinition>
    ? {
        [K in keyof G['routes']]: HonoHandler<G['routes'][K], E>;
      }
    : object) &
    (G['children'] extends Record<string, RouteGroup>
      ? {
          [K in keyof G['children']]: InferHonoGroupHandlers<
            G['children'][K],
            E
          >;
        }
      : object);

/**
 * Per-version environment mapping for type-safe handler registration
 */
export type VersionEnvMap<V extends ApiContract> = {
  [VK in keyof V]: {
    [CK in keyof NonNullable<V[VK]['children']>]: Env;
  };
};

/**
 * Infer all handlers from an API contract for Hono with per-group environments
 */
export type InferHonoHandlers<
  C extends ApiContract,
  M extends VersionEnvMap<C>,
> = {
  [VK in keyof C]: {
    middlewares?: MiddlewareHandler[];
  } & (C[VK]['children'] extends Record<string, RouteGroup>
    ? {
        [CK in keyof C[VK]['children']]: InferHonoGroupHandlers<
          C[VK]['children'][CK],
          M[VK][CK]
        > & {
          middlewares?: MiddlewareHandler[];
        };
      }
    : object);
};

/**
 * Options for creating a Hono router
 */
export type CreateHonoRouterOptions = {
  /**
   * Base path prefix for all routes (e.g., '/api')
   */
  basePath?: string;

  /**
   * Global middleware applied to all routes
   */
  middleware?: MiddlewareHandler[];

  /**
   * Whether to register OpenAPI documentation routes
   * @default true
   */
  registerDocs?: boolean;

  /**
   * Path for OpenAPI JSON endpoint
   * @default '/openapi.json'
   */
  docsPath?: string;
};
