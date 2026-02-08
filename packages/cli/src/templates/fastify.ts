/**
 * Fastify project template
 */

export const getPackageJson = (name: string): string => {
  return JSON.stringify(
    {
      name,
      version: '0.0.1',
      private: true,
      type: 'module',
      scripts: {
        dev: 'tsx watch src/index.ts',
        start: 'node dist/index.js',
        build: 'tsup src/index.ts --format esm --dts',
      },
      dependencies: {
        '@typeful-api/core': '^0.1.1',
        '@typeful-api/fastify': '^0.1.1',
        fastify: '^5.7.2',
        zod: '^4.3.5',
      },
      devDependencies: {
        '@types/node': '^22.0.0',
        tsup: '^8.5.1',
        tsx: '^4.21.0',
        typescript: '^5.9.3',
      },
    },
    null,
    2,
  );
};

export const getIndexTs = (): string => {
  return `import Fastify from 'fastify';
import { createFastifyPlugin } from '@typeful-api/fastify';
import { api, type Item } from './api';

// In-memory store
const items: Item[] = [];

const plugin = createFastifyPlugin(api, {
  v1: {
    health: async () => ({ status: 'ok' as const }),
    items: {
      list: async ({ query }) => {
        const start = (query.page - 1) * query.limit;
        const pageItems = items.slice(start, start + query.limit);
        return {
          items: pageItems,
          total: items.length,
          page: query.page,
          limit: query.limit,
          totalPages: Math.ceil(items.length / query.limit),
        };
      },
      get: async ({ params }) => {
        const item = items.find((i) => i.id === params.id);
        if (!item) throw new Error('Not found');
        return item;
      },
      create: async ({ body }) => {
        const item: Item = {
          id: crypto.randomUUID(),
          ...body,
          createdAt: new Date().toISOString(),
        };
        items.push(item);
        return item;
      },
    },
  },
});

const fastify = Fastify({ logger: true });

fastify.register(plugin, { prefix: '/api' });

const port = Number(process.env.PORT) || 3000;

fastify.listen({ port }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
`;
};
