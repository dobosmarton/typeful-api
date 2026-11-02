/**
 * Fastify project template
 */

import { CLI_VERSION } from '../version';

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
        '@typeful-api/core': `^${CLI_VERSION}`,
        '@typeful-api/fastify': `^${CLI_VERSION}`,
        fastify: '^5.12.8',
        zod: '^4.6.7',
      },
      devDependencies: {
        '@types/node': '^26.0.0',
        tsup: '^9.0.0',
        tsx: '^4.23.15',
        typescript: '^6.0.3',
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
