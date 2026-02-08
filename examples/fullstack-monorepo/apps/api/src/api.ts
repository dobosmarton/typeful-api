/**
 * API Contract Definition
 *
 * This file defines the complete API contract using Zod schemas.
 * It serves as the single source of truth for:
 * - Request/response types
 * - OpenAPI spec generation
 * - Handler type inference
 */

import {
  defineApi,
  route,
  paginationQuery,
  cursorQuery,
  sortQuery,
  paginated,
  cursorPaginated,
} from '@typeful-api/core';
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

export const CategorySchema = z.object({
  id: z.uuid().describe('Unique category identifier'),
  name: z.string().min(1).max(100).describe('Category display name'),
  slug: z.string().describe('URL-friendly slug'),
  description: z.string().optional().describe('Category description'),
  createdAt: z.iso.datetime().describe('ISO 8601 creation timestamp'),
});

export const CreateCategorySchema = CategorySchema.omit({
  id: true,
  slug: true,
  createdAt: true,
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
            .query(
              paginationQuery().merge(
                sortQuery(['name', 'price', 'createdAt'] as const),
              ),
            )
            .returns(paginated(ProductSchema))
            .withSummary('List all products')
            .withDescription('Returns a sorted, paginated list of products')
            .withTags('products'),

          get: route
            .get('/:id')
            .params(IdParamsSchema)
            .returns(ProductSchema)
            .withErrors(404)
            .withSummary('Get a product by ID')
            .withTags('products'),

          create: route
            .post('/')
            .body(CreateProductSchema)
            .withAuth('bearer')
            .returns(ProductSchema)
            .withErrors(400, 401)
            .withSummary('Create a new product')
            .withTags('products'),

          update: route
            .patch('/:id')
            .params(IdParamsSchema)
            .body(UpdateProductSchema)
            .withAuth('bearer')
            .returns(ProductSchema)
            .withErrors(404, 401)
            .withSummary('Update a product')
            .withTags('products'),

          delete: route
            .delete('/:id')
            .params(IdParamsSchema)
            .withAuth('bearer')
            .returns(
              z.object({ success: z.boolean().describe('Whether the deletion was successful') }),
            )
            .withErrors(404, 401)
            .withSummary('Delete a product')
            .withTags('products'),
        },
      },

      categories: {
        routes: {
          list: route
            .get('/')
            .query(cursorQuery())
            .returns(cursorPaginated(CategorySchema))
            .withSummary('List all categories')
            .withDescription('Returns categories with cursor-based pagination')
            .withTags('categories'),

          get: route
            .get('/:id')
            .params(IdParamsSchema)
            .returns(CategorySchema)
            .withErrors(404)
            .withSummary('Get a category by ID')
            .withTags('categories'),

          create: route
            .post('/')
            .body(CreateCategorySchema)
            .withAuth('bearer')
            .returns(CategorySchema)
            .withErrors(400, 401)
            .withSummary('Create a new category')
            .withTags('categories'),
        },
      },
    },
  },
});

// Export types for use in handlers
export type Product = z.infer<typeof ProductSchema>;
export type CreateProduct = z.infer<typeof CreateProductSchema>;
export type UpdateProduct = z.infer<typeof UpdateProductSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type CreateCategory = z.infer<typeof CreateCategorySchema>;
