/**
 * Hono project template
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
        'generate:spec':
          "typeful-api generate-spec --contract ./src/api.ts --out ./openapi.json --title 'API' --api-version '1.0.0'",
        'generate:client':
          'typeful-api generate-client --spec ./openapi.json --out ./src/api.generated.d.ts',
      },
      dependencies: {
        '@hono/node-server': '^2.1.6',
        '@hono/zod-openapi': '^1.6.3',
        '@typeful-api/core': `^${CLI_VERSION}`,
        '@typeful-api/hono': `^${CLI_VERSION}`,
        hono: '^4.13.16',
        zod: '^4.6.7',
      },
      devDependencies: {
        '@typeful-api/cli': `^${CLI_VERSION}`,
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
  return `import { serve } from '@hono/node-server';
import { HttpError, createHonoRouter } from '@typeful-api/hono';
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
        if (!item) throw new HttpError(404, 'Item not found');
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
