/**
 * Type-safe API Client
 *
 * Uses openapi-fetch with generated types from the API's OpenAPI spec.
 * All API calls are fully typed based on the Zod schemas defined in the API.
 */

import createClient from 'openapi-fetch';
import type { paths } from './api.generated';

export const apiClient = createClient<paths>({
  baseUrl: 'http://localhost:3000/api',
});
