const BEARER_PREFIX = 'Bearer ';
const BASIC_PREFIX = 'Basic ';

/**
 * Extract a bearer token from an Authorization header.
 * Returns null if the header is missing or not in "Bearer <token>" format.
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith(BEARER_PREFIX)) return null;
  const token = authHeader.slice(BEARER_PREFIX.length);
  return token.length > 0 ? token : null;
}

/**
 * Extract an API key from a header value (typically X-API-Key).
 * Returns null if the header is missing or empty.
 */
export function extractApiKey(headerValue: string | undefined): string | null {
  if (!headerValue || headerValue.length === 0) return null;
  return headerValue;
}

/**
 * Extract username and password from a Basic Authorization header.
 * Returns null if the header is missing, not in "Basic <base64>" format,
 * or the decoded value doesn't contain a colon separator.
 */
export function extractBasicCredentials(
  authHeader: string | undefined,
): { username: string; password: string } | null {
  if (!authHeader?.startsWith(BASIC_PREFIX)) return null;
  const encoded = authHeader.slice(BASIC_PREFIX.length);
  if (encoded.length === 0) return null;

  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return null;
  }

  const colonIndex = decoded.indexOf(':');
  if (colonIndex === -1) return null;

  return {
    username: decoded.slice(0, colonIndex),
    password: decoded.slice(colonIndex + 1),
  };
}
