import { defineConfig } from '@typeful-api/cli';

/**
 * Clients for the services checkout calls. Run `pnpm generate:clients` (with the orders service
 * running) whenever a service changes its API, and commit the result.
 */
export default defineConfig({
  client: [
    {
      spec: process.env.ORDERS_DOCS_URL ?? 'http://localhost:3001/api/api-doc',
      out: './src/clients/orders.ts',
      // For a protected document: headers: { Authorization: `Bearer ${process.env.DOCS_TOKEN}` }
    },
  ],
});
