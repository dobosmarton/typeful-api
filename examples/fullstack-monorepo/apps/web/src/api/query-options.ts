/**
 * TanStack Query Options Factory
 *
 * Centralized query options for all API endpoints.
 * Uses the type-safe apiClient to ensure request/response types match the API.
 *
 * Pattern: Query options factory functions that return queryOptions objects.
 * This enables composable, reusable query configurations.
 */

import { queryOptions } from '@tanstack/react-query';
import { apiClient } from './client';

export const productQueries = {
  /**
   * Query options for listing all products with pagination
   */
  all: (params?: { page?: number; limit?: number }) =>
    queryOptions({
      queryKey: ['products', params ?? {}],
      queryFn: async () => {
        const { data, error } = await apiClient.GET('/v1/products', {
          params: {
            query: {
              page: params?.page ?? 1,
              limit: params?.limit ?? 20,
            },
          },
        });
        if (error) throw new Error('Failed to fetch products');
        return data;
      },
    }),

  /**
   * Query options for fetching a single product by ID
   */
  detail: (id: string) =>
    queryOptions({
      queryKey: ['products', id],
      queryFn: async () => {
        const { data, error } = await apiClient.GET('/v1/products/{id}', {
          params: { path: { id } },
        });
        if (error) throw new Error('Failed to fetch product');
        return data;
      },
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
      queryFn: async () => {
        const { data, error } = await apiClient.GET('/v1/health');
        if (error) throw new Error('Health check failed');
        return data;
      },
    }),
};
