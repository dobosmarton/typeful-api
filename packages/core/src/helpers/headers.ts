import type { WithResponseHeaders } from '../types';

/**
 * Wraps a response body with typed headers for contract-defined response headers.
 * Adapters detect the sentinel and set headers before sending the body.
 *
 * @example
 * ```ts
 * import { withHeaders } from '@typeful-api/core';
 *
 * const handler = async ({ params }) => {
 *   const product = await db.products.find(params.id);
 *   return withHeaders(product, {
 *     'X-Request-Id': crypto.randomUUID(),
 *     'Cache-Control': 'max-age=60',
 *   });
 * };
 * ```
 */
export function withHeaders<TBody, THeaders extends Record<string, string>>(
  body: TBody,
  headers: THeaders,
): WithResponseHeaders<TBody, THeaders> {
  return { __typefulHeaders: true as const, body, headers };
}

/**
 * Type guard to detect a `withHeaders()` return value at runtime.
 * Adapters use this to distinguish between plain response bodies
 * and bodies that carry response headers.
 */
export function isWithHeaders(
  value: unknown,
): value is WithResponseHeaders<unknown, Record<string, string>> {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__typefulHeaders' in value &&
    (value as Record<string, unknown>).__typefulHeaders === true
  );
}
