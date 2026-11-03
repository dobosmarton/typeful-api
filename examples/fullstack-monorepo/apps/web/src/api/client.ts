/**
 * Type-safe API Client
 *
 * Created from the shared contract package, so request and response types come straight from
 * the Zod schemas the API uses. There is no code generation step.
 */

import { api } from '@example/contract';
import { createClient } from '@typeful-api/core/client';

export const apiClient = createClient(api, {
  baseUrl: 'http://localhost:3000/api',
});
