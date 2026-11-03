/**
 * Typed Client Demo
 *
 * Calls the running server through a client created from the same contract: no code
 * generation, and every response is typed per status.
 *
 * Start the server first (pnpm dev), then run: pnpm demo:client
 */

import { createClient, unwrap } from '@typeful-api/core/client';
import { api } from './api';

const client = createClient(api, {
  baseUrl: process.env.API_URL ?? 'http://localhost:3000/api',
});

// unwrap() returns the 200 body, or throws a ResponseError for anything else
const page = await client.v1.products.list({ query: { limit: 5 } }).then(unwrap);
console.log(`Listed ${page.products.length} of ${page.total} products`);

// Declared errors are part of the response union: narrow on the status
const missing = await client.v1.products.get({
  params: { id: '00000000-0000-4000-8000-000000000000' },
});
if (missing.status === 404) {
  console.log(`404 ${missing.body.code}: ${missing.body.detail}`);
}

// Input that type-checks but fails the schema (price must be positive) gets a 422 problem
const invalid = await client.v1.products.create({
  body: { name: 'Broken pen', price: -1, inStock: true },
});
if (invalid.status === 422) {
  for (const error of invalid.body.errors ?? []) {
    console.log(`422 ${error.location}.${error.path.join('.')}: ${error.message}`);
  }
}

const created = await client.v1.products
  .create({ body: { name: 'Fountain pen', price: 4900, inStock: true } })
  .then(unwrap);
console.log(`Created ${created.name} (${created.id})`);
