/**
 * @typeful-api/cli
 *
 * Command-line tool and programmatic API for generating OpenAPI specs
 * and TypeScript client types from typi contracts.
 *
 * ## CLI Usage
 *
 * ```bash
 * # Generate OpenAPI spec from contract
 * npx @typeful-api/cli generate-spec --contract ./src/api.ts --out ./openapi.json
 *
 * # Generate TypeScript client types from spec
 * npx @typeful-api/cli generate-client --spec ./openapi.json --out ./src/client.d.ts
 *
 * # Watch mode for development
 * npx @typeful-api/cli generate-spec --contract ./src/api.ts --watch
 * ```
 *
 * ## Programmatic Usage
 *
 * ```ts
 * import { generateSpec, generateClient } from '@typeful-api/cli';
 *
 * // Generate spec programmatically
 * await generateSpec({
 *   contract: './src/api.ts',
 *   out: './openapi.json',
 *   title: 'My API',
 *   version: '1.0.0',
 * });
 *
 * // Generate client types
 * await generateClient({
 *   spec: './openapi.json',
 *   out: './src/client.d.ts',
 * });
 * ```
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import { generateSpecJson, type ApiContract, type GenerateSpecOptions } from '@typeful-api/core';
import { generateClientFile, type GenerateClientOptions } from './client-generator';

export type GenerateSpecProgrammaticOptions = {
  /**
   * The API contract object (already loaded)
   */
  contract: ApiContract;

  /**
   * Output path for the OpenAPI spec
   */
  out: string;

  /**
   * API title
   */
  title: string;

  /**
   * API version
   */
  version: string;

  /**
   * API description
   */
  description?: string;

  /**
   * Server URLs
   */
  servers?: string[];

  /**
   * Pretty print the output
   * @default true
   */
  pretty?: boolean;
};

export type GenerateClientProgrammaticOptions = GenerateClientOptions;

/**
 * Generate OpenAPI spec from an API contract (programmatic API)
 *
 * @example
 * ```ts
 * import { generateSpec } from '@typeful-api/cli';
 * import { api } from './api';
 *
 * await generateSpec({
 *   contract: api,
 *   out: './openapi.json',
 *   title: 'My API',
 *   version: '1.0.0',
 *   description: 'A sample API',
 *   servers: ['https://api.example.com'],
 * });
 * ```
 */
export async function generateSpec(options: GenerateSpecProgrammaticOptions): Promise<string> {
  const { contract, out, title, version, description, servers, pretty = true } = options;

  const specOptions: GenerateSpecOptions = {
    info: {
      title,
      version,
      description,
    },
  };

  if (servers?.length) {
    specOptions.servers = servers.map((url) => ({ url }));
  }

  const specJson = generateSpecJson(contract, specOptions, pretty);

  const outDir = path.dirname(path.resolve(process.cwd(), out));
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outPath = path.resolve(process.cwd(), out);
  fs.writeFileSync(outPath, specJson, 'utf-8');

  return outPath;
}

/**
 * Generate a typed client module (`.ts`) or types only (`.d.ts`) from an OpenAPI spec
 * (programmatic API). The spec can be a local file, a URL such as another service's
 * `/api-doc`, or a spec object.
 *
 * @example
 * ```ts
 * import { generateClient } from '@typeful-api/cli';
 *
 * await generateClient({
 *   spec: 'https://orders.internal/api/api-doc',
 *   out: './src/clients/orders.ts',
 *   headers: { Authorization: `Bearer ${process.env.DOCS_TOKEN}` },
 * });
 * ```
 */
export async function generateClient(options: GenerateClientProgrammaticOptions): Promise<string> {
  const { outPath } = await generateClientFile(options);
  return outPath;
}

// Re-export core functions that are useful for CLI scripts
export { generateSpecJson } from '@typeful-api/core';
export type { ApiContract, GenerateSpecOptions } from '@typeful-api/core';

// Config file utilities
export { defineConfig } from './config';
export type { ClientConfig, TypefulApiConfig } from './config';
