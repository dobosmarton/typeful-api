/**
 * Reason phrases (RFC 9110) for the status codes typeful-api produces or documents
 */
const reasonPhrases: Readonly<Record<number, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  413: 'Content Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

/**
 * Machine-readable `code` values used when a problem does not set one
 */
const defaultCodes: Readonly<Record<number, string>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'CONTENT_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMIT_EXCEEDED',
  500: 'INTERNAL_ERROR',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
};

/**
 * The RFC 9110 reason phrase for a status code, if typeful-api knows it
 */
export const statusText = (status: number): string | undefined => reasonPhrases[status];

/**
 * The default problem `code` for a status code, e.g. 404 → `NOT_FOUND`
 */
export const defaultCode = (status: number): string => defaultCodes[status] ?? `HTTP_${status}`;
