/**
 * API Contract Definition
 *
 * This file defines the complete API contract using Zod schemas.
 * It serves as the single source of truth for:
 * - Request/response types
 * - OpenAPI spec generation
 * - Handler type inference
 */

import { defineApi, route } from '@typi/core';
import { z } from 'zod';

// ============================================
// Schemas
// ============================================

export const ProductSchema = z.object({
  id: z.uuid().describe('Unique product identifier'),
  name: z.string().min(1).max(100).describe('Product display name'),
  description: z.string().optional().describe('Detailed product description'),
  price: z.number().positive().describe('Product price in cents'),
  inStock: z.boolean().describe('Whether the product is currently in stock'),
  createdAt: z.iso.datetime().describe('ISO 8601 timestamp when the product was created'),
});

export const CreateProductSchema = ProductSchema.omit({
  id: true,
  createdAt: true,
});

export const UpdateProductSchema = CreateProductSchema.partial();

export const IdParamsSchema = z.object({
  id: z.uuid().describe('Resource identifier (UUID format)'),
});

export const PaginationQuerySchema = z.object({
  page: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .default(1)
    .describe('Page number for pagination (1-indexed)'),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(20)
    .describe('Number of items per page (max 100)'),
});

export const ProductListResponseSchema = z.object({
  products: z.array(ProductSchema).describe('Array of product items'),
  total: z.number().describe('Total number of products matching the query'),
  page: z.number().describe('Current page number'),
  limit: z.number().describe('Number of items per page'),
});

export const HealthCheckSchema = z.object({
  status: z.literal('ok').describe('Service health status'),
  timestamp: z.iso.datetime().describe('ISO 8601 timestamp of the health check'),
});

// ============================================
// API Contract
// ============================================

export const api = defineApi({
  v1: {
    routes: {
      health: route
        .get('/health')
        .returns(HealthCheckSchema)
        .withSummary('Health check endpoint')
        .withTags('system'),
    },
    children: {
      products: {
        routes: {
          list: route
            .get('/')
            .query(PaginationQuerySchema)
            .returns(ProductListResponseSchema)
            .withSummary('List all products')
            .withDescription('Returns a paginated list of products'),

          get: route
            .get('/:id')
            .params(IdParamsSchema)
            .returns(ProductSchema)
            .withSummary('Get a product by ID'),

          create: route
            .post('/')
            .body(CreateProductSchema)
            .auth('bearer')
            .returns(ProductSchema)
            .withSummary('Create a new product'),

          update: route
            .patch('/:id')
            .params(IdParamsSchema)
            .body(UpdateProductSchema)
            .auth('bearer')
            .returns(ProductSchema)
            .withSummary('Update a product'),

          delete: route
            .delete('/:id')
            .params(IdParamsSchema)
            .auth('bearer')
            .returns(
              z.object({ success: z.boolean().describe('Whether the deletion was successful') }),
            )
            .withSummary('Delete a product'),
        },
      },
    },
  },
});

// Export types for use in handlers
export type Product = z.infer<typeof ProductSchema>;
export type CreateProduct = z.infer<typeof CreateProductSchema>;
export type UpdateProduct = z.infer<typeof UpdateProductSchema>;
