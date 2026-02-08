/**
 * Shared template pieces used across all framework templates
 */

export const getTsConfig = (): string => {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        outDir: './dist',
        rootDir: './src',
        declaration: true,
        sourceMap: true,
      },
      include: ['src'],
      exclude: ['node_modules', 'dist'],
    },
    null,
    2,
  );
};

export const getGitIgnore = (): string => {
  return `node_modules/
dist/
*.tsbuildinfo
.env
.env.local
openapi.json
`;
};

export const getApiTs = (): string => {
  return `import { defineApi, route, paginationQuery, paginated, notFoundError } from '@typeful-api/core';
import { z } from 'zod';

// ============================================
// Schemas
// ============================================

export const ItemSchema = z.object({
  id: z.uuid().describe('Unique identifier'),
  name: z.string().min(1).max(100).describe('Item name'),
  createdAt: z.iso.datetime().describe('Creation timestamp'),
});

export const CreateItemSchema = ItemSchema.omit({ id: true, createdAt: true });

export const IdParamsSchema = z.object({
  id: z.uuid().describe('Resource ID'),
});

// ============================================
// API Contract
// ============================================

export const api = defineApi({
  v1: {
    routes: {
      health: route
        .get('/health')
        .returns(z.object({ status: z.literal('ok') }))
        .withSummary('Health check'),
    },
    children: {
      items: {
        routes: {
          list: route
            .get('/')
            .query(paginationQuery())
            .returns(paginated(ItemSchema))
            .withSummary('List items'),

          get: route
            .get('/:id')
            .params(IdParamsSchema)
            .returns(ItemSchema)
            .withErrors(404)
            .withSummary('Get item by ID'),

          create: route
            .post('/')
            .body(CreateItemSchema)
            .returns(ItemSchema)
            .withAuth('bearer')
            .withSummary('Create an item'),
        },
      },
    },
  },
});

// Export types for use in handlers
export type Item = z.infer<typeof ItemSchema>;
export type CreateItem = z.infer<typeof CreateItemSchema>;
`;
};
