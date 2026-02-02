import { z } from 'zod';

export const ProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  price: z.number().positive(),
});

export const CreateProductSchema = ProductSchema.omit({ id: true });

export const UpdateProductSchema = CreateProductSchema.partial();

export const IdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
});

export const HealthSchema = z.object({
  status: z.string(),
});

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const SuccessSchema = z.object({
  success: z.boolean(),
});

export const ErrorSchema = z.object({
  error: z.string(),
  code: z.number(),
});

export type Product = z.infer<typeof ProductSchema>;
export type CreateProduct = z.infer<typeof CreateProductSchema>;
export type UpdateProduct = z.infer<typeof UpdateProductSchema>;
