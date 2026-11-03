import type { AuthType } from './types';

/**
 * Credentials extracted from the request, keyed by auth type.
 * Each adapter extracts these from framework-specific request objects.
 */
export type AuthCredentials = {
  bearer: { token: string };
  apiKey: { key: string };
  basic: { username: string; password: string };
  none: never;
};

/**
 * Verify function that receives extracted credentials and returns a user object.
 * Throw or return a rejected promise to reject the request.
 */
export type AuthVerifyFn<T extends AuthType, TUser = unknown> = T extends 'none'
  ? never
  : (credentials: AuthCredentials[T]) => Promise<TUser> | TUser;

/**
 * Auth configuration mapping auth types to verify functions.
 * Only types used in the contract need to be provided.
 *
 * @example
 * ```ts
 * const auth: AuthConfig<{ id: string; role: string }> = {
 *   bearer: async ({ token }) => {
 *     const user = await verifyJWT(token);
 *     return { id: user.sub, role: user.role };
 *   },
 *   apiKey: async ({ key }) => {
 *     const user = await db.apiKeys.findByKey(key);
 *     if (!user) throw new Error('Invalid API key');
 *     return { id: user.id, role: 'service' };
 *   },
 * };
 * ```
 */
export type AuthConfig<TUser = unknown> = {
  bearer?: AuthVerifyFn<'bearer', TUser>;
  apiKey?: AuthVerifyFn<'apiKey', TUser>;
  basic?: AuthVerifyFn<'basic', TUser>;
  /**
   * Called with the error when a verify function throws, e.g. for logging. It does not change
   * the response: adapters still send 401, or the thrown `HttpError` (e.g. a 403) as is.
   */
  onError?: (error: unknown, authType: AuthType) => void | Promise<void>;
};
