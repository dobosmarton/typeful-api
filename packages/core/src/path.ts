/**
 * Matches `:param` segments in route paths
 */
export const PATH_PARAM_PATTERN = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;

/**
 * Convert a path with `:param` syntax to OpenAPI `{param}` syntax
 */
export const convertPathParams = (path: string): string => path.replace(PATH_PARAM_PATTERN, '{$1}');
