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
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  price: z.number().positive(),
  inStock: z.boolean(),
  createdAt: z.string().datetime(),
});

export const CreateProductSchema = ProductSchema.omit({
  id: true,
  createdAt: true,
});

export const UpdateProductSchema = CreateProductSchema.partial();

export const IdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export const ProductListResponseSchema = z.object({
  products: z.array(ProductSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export const HealthCheckSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.string().datetime(),
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
        .summary('Health check endpoint')
        .tags('system'),
    },
    children: {
      products: {
        routes: {
          list: route
            .get('/')
            .query(PaginationQuerySchema)
            .returns(ProductListResponseSchema)
            .summary('List all products')
            .description('Returns a paginated list of products'),

          get: route
            .get('/:id')
            .params(IdParamsSchema)
            .returns(ProductSchema)
            .summary('Get a product by ID'),

          create: route
            .post('/')
            .body(CreateProductSchema)
            .returns(ProductSchema)
            .auth('bearer')
            .summary('Create a new product'),

          update: route
            .patch('/:id')
            .params(IdParamsSchema)
            .body(UpdateProductSchema)
            .returns(ProductSchema)
            .auth('bearer')
            .summary('Update a product'),

          delete: route
            .delete('/:id')
            .params(IdParamsSchema)
            .returns(z.object({ success: z.boolean() }))
            .auth('bearer')
            .summary('Delete a product'),
        },
      },
    },
  },
});

// Export types for use in handlers
export type Product = z.infer<typeof ProductSchema>;
export type CreateProduct = z.infer<typeof CreateProductSchema>;
export type UpdateProduct = z.infer<typeof UpdateProductSchema>;
