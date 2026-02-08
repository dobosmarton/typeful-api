/**
 * Hono project template
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
        'generate:spec':
          "typeful-api generate-spec --contract ./src/api.ts --out ./openapi.json --title 'API' --api-version '1.0.0'",
        'generate:client':
          'typeful-api generate-client --spec ./openapi.json --out ./src/api.generated.d.ts',
      },
      dependencies: {
        '@hono/node-server': '^1.19.9',
        '@hono/zod-openapi': '^1.2.0',
        '@typeful-api/core': '^0.1.1',
        '@typeful-api/hono': '^0.1.1',
        hono: '^4.11.4',
        zod: '^4.3.5',
      },
      devDependencies: {
        '@typeful-api/cli': '^0.1.1',
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
  return `import { serve } from '@hono/node-server';
import { createHonoRouter } from '@typeful-api/hono';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { api, type Item } from './api';

// In-memory store
const items: Item[] = [];

const router = createHonoRouter(api, {
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

const app = new Hono();
app.use('*', logger());
app.use('*', cors());
app.route('/api', router);

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(\`Server running at http://localhost:\${info.port}\`);
  console.log(\`API Docs: http://localhost:\${info.port}/api/api-doc\`);
});
`;
};
