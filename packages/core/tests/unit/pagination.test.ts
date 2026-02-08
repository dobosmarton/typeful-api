import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  paginationQuery,
  cursorQuery,
  sortQuery,
  paginated,
  cursorPaginated,
} from '../../src/helpers/pagination';
import { route } from '../../src/route';
import { defineApi } from '../../src/contract';
import { generateSpec } from '../../src/spec';

describe('pagination helpers', () => {
  describe('paginationQuery', () => {
    it('creates a schema with default options', () => {
      const schema = paginationQuery();
      const result = schema.parse({});
      expect(result).toEqual({ page: 1, limit: 20 });
    });

    it('accepts valid page and limit', () => {
      const schema = paginationQuery();
      const result = schema.parse({ page: 3, limit: 50 });
      expect(result).toEqual({ page: 3, limit: 50 });
    });

    it('coerces string values from query strings', () => {
      const schema = paginationQuery();
      const result = schema.parse({ page: '2', limit: '10' });
      expect(result).toEqual({ page: 2, limit: 10 });
    });

    it('respects custom defaults', () => {
      const schema = paginationQuery({ defaultPage: 0, defaultLimit: 10 });
      const result = schema.parse({});
      expect(result).toEqual({ page: 0, limit: 10 });
    });

    it('enforces maxLimit', () => {
      const schema = paginationQuery({ maxLimit: 50 });
      const result = schema.safeParse({ limit: 51 });
      expect(result.success).toBe(false);
    });

    it('allows limit up to maxLimit', () => {
      const schema = paginationQuery({ maxLimit: 50 });
      const result = schema.parse({ limit: 50 });
      expect(result.limit).toBe(50);
    });

    it('rejects negative page numbers', () => {
      const schema = paginationQuery();
      const result = schema.safeParse({ page: -1 });
      expect(result.success).toBe(false);
    });

    it('rejects zero as page number', () => {
      const schema = paginationQuery();
      const result = schema.safeParse({ page: 0 });
      expect(result.success).toBe(false);
    });

    it('rejects non-integer values', () => {
      const schema = paginationQuery();
      const result = schema.safeParse({ page: 1.5 });
      expect(result.success).toBe(false);
    });
  });

  describe('cursorQuery', () => {
    it('creates a schema with default options', () => {
      const schema = cursorQuery();
      const result = schema.parse({});
      expect(result).toEqual({ cursor: undefined, limit: 20 });
    });

    it('accepts a cursor string', () => {
      const schema = cursorQuery();
      const result = schema.parse({ cursor: 'abc123', limit: 10 });
      expect(result).toEqual({ cursor: 'abc123', limit: 10 });
    });

    it('coerces string limit from query strings', () => {
      const schema = cursorQuery();
      const result = schema.parse({ limit: '15' });
      expect(result.limit).toBe(15);
    });

    it('respects custom defaults', () => {
      const schema = cursorQuery({ defaultLimit: 50 });
      const result = schema.parse({});
      expect(result.limit).toBe(50);
    });

    it('enforces maxLimit', () => {
      const schema = cursorQuery({ maxLimit: 25 });
      const result = schema.safeParse({ limit: 26 });
      expect(result.success).toBe(false);
    });

    it('cursor is optional', () => {
      const schema = cursorQuery();
      const result = schema.parse({ limit: 10 });
      expect(result.cursor).toBeUndefined();
    });
  });

  describe('sortQuery', () => {
    it('creates a schema with given fields', () => {
      const schema = sortQuery(['name', 'createdAt'] as const);
      const result = schema.parse({ sortBy: 'name' });
      expect(result).toEqual({ sortBy: 'name', sortOrder: 'asc' });
    });

    it('defaults sortOrder to asc', () => {
      const schema = sortQuery(['name'] as const);
      const result = schema.parse({});
      expect(result.sortOrder).toBe('asc');
    });

    it('respects custom default order', () => {
      const schema = sortQuery(['name'] as const, { defaultOrder: 'desc' });
      const result = schema.parse({});
      expect(result.sortOrder).toBe('desc');
    });

    it('accepts desc sort order', () => {
      const schema = sortQuery(['name'] as const);
      const result = schema.parse({ sortBy: 'name', sortOrder: 'desc' });
      expect(result).toEqual({ sortBy: 'name', sortOrder: 'desc' });
    });

    it('rejects invalid field names', () => {
      const schema = sortQuery(['name', 'price'] as const);
      const result = schema.safeParse({ sortBy: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('rejects invalid sort order', () => {
      const schema = sortQuery(['name'] as const);
      const result = schema.safeParse({ sortOrder: 'random' });
      expect(result.success).toBe(false);
    });

    it('sortBy is optional', () => {
      const schema = sortQuery(['name'] as const);
      const result = schema.parse({});
      expect(result.sortBy).toBeUndefined();
    });
  });

  describe('paginated', () => {
    const ItemSchema = z.object({ id: z.string(), name: z.string() });

    it('creates a paginated response schema', () => {
      const schema = paginated(ItemSchema);
      const result = schema.parse({
        items: [{ id: '1', name: 'Item 1' }],
        total: 50,
        page: 1,
        limit: 20,
        totalPages: 3,
      });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(50);
      expect(result.totalPages).toBe(3);
    });

    it('accepts empty items array', () => {
      const schema = paginated(ItemSchema);
      const result = schema.parse({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });
      expect(result.items).toHaveLength(0);
    });

    it('validates item shape', () => {
      const schema = paginated(ItemSchema);
      const result = schema.safeParse({
        items: [{ invalid: true }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      expect(result.success).toBe(false);
    });

    it('requires all envelope fields', () => {
      const schema = paginated(ItemSchema);
      const result = schema.safeParse({
        items: [],
        total: 0,
        // missing page, limit, totalPages
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative total', () => {
      const schema = paginated(ItemSchema);
      const result = schema.safeParse({
        items: [],
        total: -1,
        page: 1,
        limit: 20,
        totalPages: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('cursorPaginated', () => {
    const ItemSchema = z.object({ id: z.string() });

    it('creates a cursor-paginated response schema', () => {
      const schema = cursorPaginated(ItemSchema);
      const result = schema.parse({
        items: [{ id: '1' }, { id: '2' }],
        nextCursor: 'cursor_abc',
        hasMore: true,
      });
      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe('cursor_abc');
      expect(result.hasMore).toBe(true);
    });

    it('accepts null nextCursor for last page', () => {
      const schema = cursorPaginated(ItemSchema);
      const result = schema.parse({
        items: [{ id: '1' }],
        nextCursor: null,
        hasMore: false,
      });
      expect(result.nextCursor).toBeNull();
      expect(result.hasMore).toBe(false);
    });

    it('validates item shape', () => {
      const schema = cursorPaginated(ItemSchema);
      const result = schema.safeParse({
        items: [{ wrong: true }],
        nextCursor: null,
        hasMore: false,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('integration with route builder and spec generation', () => {
    const ProductSchema = z.object({
      id: z.string(),
      name: z.string(),
    });

    it('works with route builder for offset pagination', () => {
      const listRoute = route.get('/').query(paginationQuery()).returns(paginated(ProductSchema));

      expect(listRoute.method).toBe('get');
      expect(listRoute.query).toBeDefined();
      expect(listRoute.response).toBeDefined();
    });

    it('works with route builder for cursor pagination', () => {
      const listRoute = route.get('/').query(cursorQuery()).returns(cursorPaginated(ProductSchema));

      expect(listRoute.method).toBe('get');
      expect(listRoute.query).toBeDefined();
      expect(listRoute.response).toBeDefined();
    });

    it('works with merged sort + pagination query', () => {
      const combinedQuery = paginationQuery().merge(sortQuery(['name', 'price'] as const));
      const listRoute = route.get('/').query(combinedQuery).returns(paginated(ProductSchema));

      expect(listRoute.query).toBeDefined();

      // Verify the merged schema accepts all fields
      const result = combinedQuery.parse({
        page: '2',
        limit: '10',
        sortBy: 'name',
        sortOrder: 'desc',
      });
      expect(result).toEqual({
        page: 2,
        limit: 10,
        sortBy: 'name',
        sortOrder: 'desc',
      });
    });

    it('generates valid OpenAPI spec with pagination', () => {
      const api = defineApi({
        v1: {
          children: {
            products: {
              routes: {
                list: route
                  .get('/')
                  .query(paginationQuery())
                  .returns(paginated(ProductSchema))
                  .withSummary('List products'),
              },
            },
          },
        },
      });

      const spec = generateSpec(api, {
        info: { title: 'Test', version: '1.0.0' },
      });

      const listOp = spec.paths['/v1/products']?.get;
      expect(listOp).toBeDefined();
      expect(listOp?.parameters).toBeDefined();

      // Check query parameters exist
      const pageParam = listOp?.parameters?.find((p) => p.name === 'page');
      const limitParam = listOp?.parameters?.find((p) => p.name === 'limit');
      expect(pageParam).toBeDefined();
      expect(pageParam?.in).toBe('query');
      expect(limitParam).toBeDefined();
      expect(limitParam?.in).toBe('query');

      // Check response schema has paginated envelope
      const responseSchema = listOp?.responses['200']?.content?.['application/json']?.schema;
      expect(responseSchema).toBeDefined();
      expect(responseSchema?.properties).toHaveProperty('items');
      expect(responseSchema?.properties).toHaveProperty('total');
      expect(responseSchema?.properties).toHaveProperty('page');
      expect(responseSchema?.properties).toHaveProperty('limit');
      expect(responseSchema?.properties).toHaveProperty('totalPages');
    });
  });
});
