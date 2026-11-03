/**
 * TanStack Query Options Factory
 *
 * Centralized query options for all API endpoints.
 * `unwrap` returns the body of a 200 response and throws a `ResponseError` (carrying the
 * Problem Details body) for anything else, which is what TanStack Query expects.
 *
 * Pattern: Query options factory functions that return queryOptions objects.
 * This enables composable, reusable query configurations.
 */

import { queryOptions } from '@tanstack/react-query';
import { unwrap, type InferClientArgs } from '@typeful-api/core/client';
import { apiClient } from './client';

/** `{ page?, limit?, sortBy?, sortOrder? }`, inferred from the contract */
type ProductListQuery = InferClientArgs<typeof apiClient.v1.products.list>['query'];

export const productQueries = {
  /**
   * Query options for listing all products with pagination
   */
  all: (query: ProductListQuery = {}) =>
    queryOptions({
      queryKey: ['products', query],
      queryFn: ({ signal }) => apiClient.v1.products.list({ query, signal }).then(unwrap),
    }),

  /**
   * Query options for fetching a single product by ID
   */
  detail: (id: string) =>
    queryOptions({
      queryKey: ['products', id],
      queryFn: ({ signal }) => apiClient.v1.products.get({ params: { id }, signal }).then(unwrap),
      enabled: !!id,
    }),
};

export const healthQueries = {
  /**
   * Query options for health check endpoint
   */
  check: () =>
    queryOptions({
      queryKey: ['health'],
      queryFn: ({ signal }) => apiClient.v1.health({ signal }).then(unwrap),
    }),
};
