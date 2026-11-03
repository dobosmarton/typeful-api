/**
 * Matches `:param` segments in route paths
 */
export const PATH_PARAM_PATTERN = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;

/**
 * Convert a path with `:param` syntax to OpenAPI `{param}` syntax
 */
export const convertPathParams = (path: string): string => path.replace(PATH_PARAM_PATTERN, '{$1}');

/**
 * OpenAPI extension on every operation in specs typeful-api generates. Its value is the route's
 * place in the contract, e.g. `['v1', 'products', 'get']`, so a typed client generated from the
 * spec can mirror the contract exactly.
 */
export const TYPEFUL_ROUTE_EXTENSION = 'x-typeful-route';
