import { z, type ZodType } from 'zod';

/**
 * Options for offset-based pagination query schema
 */
type PaginationQueryOptions = {
  /** Default page number (default: 1) */
  defaultPage?: number;
  /** Default page size (default: 20) */
  defaultLimit?: number;
  /** Maximum allowed page size (default: 100) */
  maxLimit?: number;
};

/**
 * Options for cursor-based pagination query schema
 */
type CursorQueryOptions = {
  /** Default page size (default: 20) */
  defaultLimit?: number;
  /** Maximum allowed page size (default: 100) */
  maxLimit?: number;
};

/**
 * Options for sort query schema
 */
type SortQueryOptions = {
  /** Default sort direction (default: 'asc') */
  defaultOrder?: 'asc' | 'desc';
};

/**
 * Creates a pagination query schema for offset-based pagination.
 * Uses `z.coerce.number()` for HTTP query string compatibility.
 *
 * @example
 * ```ts
 * const query = paginationQuery({ maxLimit: 50 });
 * // Inferred type: { page: number, limit: number }
 *
 * route.get('/').query(paginationQuery()).returns(paginated(ProductSchema))
 * ```
 */
export const paginationQuery = (options?: PaginationQueryOptions) => {
  const { defaultPage = 1, defaultLimit = 20, maxLimit = 100 } = options ?? {};

  return z.object({
    page: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .default(defaultPage)
      .describe('Page number (1-indexed)'),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(maxLimit)
      .optional()
      .default(defaultLimit)
      .describe(`Items per page (max ${maxLimit})`),
  });
};

/**
 * Creates a cursor-based pagination query schema.
 * Uses `z.coerce.number()` for the limit field for HTTP query string compatibility.
 *
 * @example
 * ```ts
 * route.get('/').query(cursorQuery()).returns(cursorPaginated(ProductSchema))
 * ```
 */
export const cursorQuery = (options?: CursorQueryOptions) => {
  const { defaultLimit = 20, maxLimit = 100 } = options ?? {};

  return z.object({
    cursor: z.string().optional().describe('Pagination cursor for the next page'),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(maxLimit)
      .optional()
      .default(defaultLimit)
      .describe(`Items per page (max ${maxLimit})`),
  });
};

/**
 * Creates a sort query schema for a given set of sortable fields.
 * The fields parameter must contain at least one field.
 *
 * @example
 * ```ts
 * const query = sortQuery(['name', 'createdAt', 'price'] as const);
 * // Inferred type: { sortBy?: 'name' | 'createdAt' | 'price', sortOrder?: 'asc' | 'desc' }
 *
 * // Combine with pagination:
 * route.get('/').query(paginationQuery().merge(sortQuery(['name', 'price'] as const)))
 * ```
 */
export const sortQuery = <T extends string>(
  fields: readonly [T, ...T[]],
  options?: SortQueryOptions,
) => {
  const { defaultOrder = 'asc' } = options ?? {};

  return z.object({
    sortBy: z.enum(fields).optional().describe('Field to sort by'),
    sortOrder: z.enum(['asc', 'desc']).optional().default(defaultOrder).describe('Sort direction'),
  });
};

/**
 * Wraps an item schema into an offset-based paginated response envelope.
 *
 * @example
 * ```ts
 * const response = paginated(ProductSchema);
 * // Inferred type: { items: Product[], total: number, page: number, limit: number, totalPages: number }
 *
 * route.get('/').query(paginationQuery()).returns(paginated(ProductSchema))
 * ```
 */
export const paginated = <T extends ZodType>(itemSchema: T) => {
  return z.object({
    items: z.array(itemSchema).describe('Array of items for the current page'),
    total: z.number().int().nonnegative().describe('Total number of items across all pages'),
    page: z.number().int().positive().describe('Current page number'),
    limit: z.number().int().positive().describe('Number of items per page'),
    totalPages: z.number().int().nonnegative().describe('Total number of pages'),
  });
};

/**
 * Wraps an item schema into a cursor-based paginated response envelope.
 *
 * @example
 * ```ts
 * const response = cursorPaginated(ProductSchema);
 * // Inferred type: { items: Product[], nextCursor: string | null, hasMore: boolean }
 *
 * route.get('/').query(cursorQuery()).returns(cursorPaginated(ProductSchema))
 * ```
 */
export const cursorPaginated = <T extends ZodType>(itemSchema: T) => {
  return z.object({
    items: z.array(itemSchema).describe('Array of items for the current page'),
    nextCursor: z.string().nullable().describe('Cursor for the next page, null if no more pages'),
    hasMore: z.boolean().describe('Whether more items exist beyond this page'),
  });
};
