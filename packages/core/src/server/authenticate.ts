import type { AuthConfig, AuthCredentials } from '../auth';
import { HttpError, isHttpError } from '../errors/http-error';
import { extractApiKey, extractBasicCredentials, extractBearerToken } from '../helpers/auth';
import type { AuthType } from '../types';

/**
 * Reads a request header by its lower-case name
 */
export type HeaderReader = (name: string) => string | undefined;

/**
 * Outcome of an authentication check
 */
export type AuthResult = { ok: true; user: unknown } | { ok: false; error: HttpError };

/**
 * Checks one request's credentials for a route
 */
export type Authenticator = (readHeader: HeaderReader) => Promise<AuthResult>;

type EnforcedAuthType = Exclude<AuthType, 'none'>;

const challenges: Partial<Record<EnforcedAuthType, string>> = {
  bearer: 'Bearer',
  basic: 'Basic realm="api"',
};

const extractCredentials = (
  authType: EnforcedAuthType,
  readHeader: HeaderReader,
): AuthCredentials[EnforcedAuthType] | null => {
  switch (authType) {
    case 'bearer': {
      const token = extractBearerToken(readHeader('authorization'));
      return token ? { token } : null;
    }
    case 'apiKey': {
      const key = extractApiKey(readHeader('x-api-key'));
      return key ? { key } : null;
    }
    case 'basic':
      return extractBasicCredentials(readHeader('authorization'));
  }
};

const unauthorized = (authType: EnforcedAuthType, detail: string): HttpError => {
  const challenge = challenges[authType];
  return new HttpError(401, {
    detail,
    headers: challenge ? { 'WWW-Authenticate': challenge } : undefined,
  });
};

/**
 * Builds the authentication check for a route. For adapter authors.
 *
 * Returns `null` when nothing needs enforcing: the route has no auth (or `'none'`), or the
 * config has no verify function for its auth type. Otherwise the check resolves to the
 * verified user, or to a 401 `HttpError`:
 * - missing credentials → 401 "Missing credentials"
 * - the verifier throws an `HttpError` (e.g. 403) → that error
 * - the verifier throws anything else → `onError` is called, then 401 "Authentication failed"
 */
export const createAuthenticator = (
  authType: AuthType | undefined,
  config: AuthConfig | undefined,
): Authenticator | null => {
  if (!authType || authType === 'none' || !config) return null;
  const verify = config[authType];
  if (!verify) return null;

  return async (readHeader) => {
    const credentials = extractCredentials(authType, readHeader);
    if (!credentials) {
      return { ok: false, error: unauthorized(authType, 'Missing credentials') };
    }

    try {
      return { ok: true, user: await verify(credentials as never) };
    } catch (error) {
      await config.onError?.(error, authType);
      if (isHttpError(error)) return { ok: false, error };
      return { ok: false, error: unauthorized(authType, 'Authentication failed') };
    }
  };
};
