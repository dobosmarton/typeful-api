/**
 * Derived Handler Types
 *
 * This file demonstrates how to derive and export handler types
 * from the API contract. By using `InferHonoHandlersWithVars`,
 * the types stay in sync with the contract automatically.
 *
 * Pattern: contract → InferHonoHandlersWithVars → index by path → handler type
 */

import type { InferHonoHandlersWithVars, SimpleEnv } from '@typeful-api/hono';
import type { Product } from './api';
import type { api } from './api';

// Shared variables available in all handlers via c.get()
export type AppVariables = {
  products: Product[];
};

// Hono environment type — use in middleware and app-level typing
export type AppEnv = SimpleEnv<AppVariables>;

// Full handler map inferred from the contract
// This is the type that createHonoRouter expects for the handlers argument
export type AppHandlers = InferHonoHandlersWithVars<typeof api, AppVariables>;

// Individual handler types — use these to type handlers in separate files
export type HealthHandler = AppHandlers['v1']['health'];
export type ProductHandlers = AppHandlers['v1']['products'];
