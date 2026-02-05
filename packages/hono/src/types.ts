import type { Context, Env, MiddlewareHandler } from 'hono';
import type {
  ApiContract,
  InferBody,
  InferParams,
  InferQuery,
  InferResponse,
  RouteDefinition,
  RouteGroup,
} from '@typefulapi/core';

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

// ============================================================================
// Simplified Types for Non-Cloudflare Platforms
// ============================================================================

/**
 * Simple environment type without Cloudflare Bindings.
 * Use this for Node.js, Bun, Deno, or any non-Cloudflare deployment.
 *
 * @example
 * ```ts
 * type AppEnv = SimpleEnv<{ db: Database; user: User }>;
 * ```
 */
export type SimpleEnv<V = Record<string, unknown>> = {
  Variables: V;
};

/**
 * Default environment with empty variables.
 * Use when you don't need typed context variables.
 */
export type DefaultEnv = SimpleEnv<Record<string, unknown>>;

/**
 * Simplified handler inference for platforms without Cloudflare bindings.
 * Uses DefaultEnv for all handlers - no per-group environment mapping required.
 *
 * @example
 * ```ts
 * const router = createHonoRouter(api, {
 *   v1: {
 *     products: {
 *       list: async ({ query }) => { ... },
 *     },
 *   },
 * });
 * ```
 */
export type InferSimpleHonoHandlers<C extends ApiContract> = {
  [VK in keyof C]: {
    middlewares?: MiddlewareHandler[];
  } & (C[VK]['routes'] extends Record<string, RouteDefinition>
    ? {
        [RK in keyof C[VK]['routes']]: HonoHandler<C[VK]['routes'][RK], DefaultEnv>;
      }
    : object) &
    (C[VK]['children'] extends Record<string, RouteGroup>
      ? {
          [CK in keyof C[VK]['children']]: InferHonoGroupHandlers<
            C[VK]['children'][CK],
            DefaultEnv
          > & {
            middlewares?: MiddlewareHandler[];
          };
        }
      : object);
};

/**
 * Handler inference with shared variables type.
 * All handlers share the same environment type.
 *
 * @example
 * ```ts
 * type Vars = { db: Database; logger: Logger };
 * const router = createHonoRouter<typeof api, Vars>(api, handlers);
 * ```
 */
export type InferHonoHandlersWithVars<
  C extends ApiContract,
  V extends Record<string, unknown>,
> = {
  [VK in keyof C]: {
    middlewares?: MiddlewareHandler[];
  } & (C[VK]['routes'] extends Record<string, RouteDefinition>
    ? {
        [RK in keyof C[VK]['routes']]: HonoHandler<C[VK]['routes'][RK], SimpleEnv<V>>;
      }
    : object) &
    (C[VK]['children'] extends Record<string, RouteGroup>
      ? {
          [CK in keyof C[VK]['children']]: InferHonoGroupHandlers<
            C[VK]['children'][CK],
            SimpleEnv<V>
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
