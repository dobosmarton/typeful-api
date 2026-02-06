import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { route } from '../../src/route';
import { generateSpecJson } from '../../src/spec';
import type { ApiContract } from '../../src/types';

describe('OpenAPI spec snapshots', () => {
  it('simple CRUD API', () => {
    const ProductSchema = z.object({
      id: z.string().describe('Product identifier'),
      name: z.string().min(1).max(100).describe('Product name'),
      price: z.number().positive().describe('Price in cents'),
      inStock: z.boolean().describe('Availability status'),
    });

    const CreateProductSchema = z.object({
      name: z.string().min(1).max(100).describe('Product name'),
      price: z.number().positive().describe('Price in cents'),
      inStock: z.boolean().describe('Availability status'),
    });

    const UpdateProductSchema = CreateProductSchema.partial();

    const contract: ApiContract = {
      v1: {
        children: {
          products: {
            routes: {
              list: route
                .get('/')
                .query(
                  z.object({
                    page: z.number().int().positive().optional().default(1).describe('Page number'),
                    limit: z
                      .number()
                      .int()
                      .positive()
                      .max(100)
                      .optional()
                      .default(20)
                      .describe('Items per page'),
                  }),
                )
                .returns(
                  z.object({
                    products: z.array(ProductSchema).describe('List of products'),
                    total: z.number().describe('Total count'),
                  }),
                )
                .withSummary('List products')
                .withDescription('Returns a paginated list of products'),

              get: route
                .get('/:id')
                .params(z.object({ id: z.string().describe('Product ID') }))
                .returns(ProductSchema)
                .withSummary('Get product by ID'),

              create: route
                .post('/')
                .body(CreateProductSchema)
                .withAuth('bearer')
                .returns(ProductSchema)
                .withSummary('Create a product'),

              update: route
                .patch('/:id')
                .params(z.object({ id: z.string().describe('Product ID') }))
                .body(UpdateProductSchema)
                .withAuth('bearer')
                .returns(ProductSchema)
                .withSummary('Update a product'),

              delete: route
                .delete('/:id')
                .params(z.object({ id: z.string().describe('Product ID') }))
                .withAuth('bearer')
                .returns(z.object({ success: z.boolean() }))
                .withSummary('Delete a product'),
            },
          },
        },
      },
    };

    const json = generateSpecJson(contract, {
      info: { title: 'Products API', version: '1.0.0' },
    });

    expect(json).toMatchSnapshot();
  });

  it('multi-version API with auth and metadata', () => {
    const UserSchema = z.object({
      id: z.string(),
      email: z.string(),
      role: z.enum(['admin', 'user']),
    });

    const contract: ApiContract = {
      v1: {
        routes: {
          health: route
            .get('/health')
            .returns(z.object({ status: z.string() }))
            .withSummary('Health check')
            .withTags('system'),

          legacyUsers: route
            .get('/users')
            .withAuth('apiKey')
            .markDeprecated()
            .returns(z.array(UserSchema))
            .withOperationId('listUsersLegacy')
            .withSummary('List users (deprecated)')
            .withDescription('Use v2 instead')
            .withTags('users'),
        },
      },
      v2: {
        children: {
          users: {
            routes: {
              list: route
                .get('/')
                .query(z.object({ role: z.enum(['admin', 'user']).optional() }))
                .withAuth('bearer')
                .returns(z.array(UserSchema))
                .withSummary('List users')
                .withTags('users'),

              get: route
                .get('/:id')
                .params(z.object({ id: z.string() }))
                .withAuth('bearer')
                .returns(UserSchema)
                .withSummary('Get user'),
            },
          },
        },
      },
    };

    const json = generateSpecJson(contract, {
      info: {
        title: 'Multi-Version API',
        version: '2.0.0',
        description: 'API with multiple versions and auth schemes',
      },
      servers: [{ url: 'https://api.example.com', description: 'Production' }],
    });

    expect(json).toMatchSnapshot();
  });

  it('deeply nested groups', () => {
    const RoleSchema = z.object({
      id: z.string(),
      name: z.string(),
      permissions: z.array(z.string()),
    });

    const contract: ApiContract = {
      v1: {
        children: {
          admin: {
            children: {
              users: {
                routes: {
                  list: route
                    .get('/')
                    .returns(z.array(z.object({ id: z.string(), name: z.string() }))),
                },
                children: {
                  roles: {
                    routes: {
                      list: route.get('/').returns(z.array(RoleSchema)),
                      get: route
                        .get('/:roleId')
                        .params(z.object({ roleId: z.string() }))
                        .returns(RoleSchema),
                      assign: route
                        .post('/:roleId')
                        .params(z.object({ roleId: z.string() }))
                        .body(z.object({ userId: z.string() }))
                        .withAuth('bearer')
                        .returns(z.object({ success: z.boolean() })),
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const json = generateSpecJson(contract, {
      info: { title: 'Nested Admin API', version: '1.0.0' },
    });

    expect(json).toMatchSnapshot();
  });
});
