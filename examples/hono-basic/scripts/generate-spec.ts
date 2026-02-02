/**
 * Script to generate OpenAPI spec from the API contract
 */

import { generateSpec } from '@typi/cli';
import { api } from '../src/api';

async function main() {
  console.log('Generating OpenAPI spec...');

  const outPath = await generateSpec({
    contract: api,
    out: './openapi.json',
    title: 'Products API',
    version: '1.0.0',
    description: 'A sample API for managing products',
    servers: ['http://localhost:8787'],
  });

  console.log(`OpenAPI spec generated: ${outPath}`);
}

main().catch(console.error);
