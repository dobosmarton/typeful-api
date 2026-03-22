import fs from 'node:fs';
import path from 'node:path';
import { createJiti } from 'jiti';

/**
 * Configuration file structure for typeful-api CLI.
 * All fields are optional — CLI flags override config values.
 */
export type TypefulApiConfig = {
  /**
   * Options for the `generate-spec` command
   */
  spec?: {
    /** Path to the contract file (default: ./src/api.ts) */
    contract?: string;
    /** Output path for the OpenAPI spec (default: ./openapi.json) */
    out?: string;
    /** API title */
    title?: string;
    /** API version */
    apiVersion?: string;
    /** API description */
    description?: string;
    /** Server URLs */
    servers?: string[];
    /** Pretty print the output (default: true) */
    pretty?: boolean;
  };

  /**
   * Options for the `generate-client` command
   */
  client?: {
    /** Path to the OpenAPI spec file (default: ./openapi.json) */
    spec?: string;
    /** Output path for TypeScript types (default: ./src/client.d.ts) */
    out?: string;
  };
};

/** File names to search for, in priority order */
const CONFIG_FILES = [
  'typeful.config.ts',
  'typeful.config.mts',
  'typeful.config.js',
  'typeful.config.mjs',
  'typeful.config.json',
];

/**
 * Find the config file by walking up from the given directory.
 * Returns the absolute path if found, or undefined.
 */
function findConfigFile(startDir: string): string | undefined {
  let dir = startDir;
  let previous: string;

  do {
    for (const name of CONFIG_FILES) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    previous = dir;
    dir = path.dirname(dir);
  } while (dir !== previous);

  return undefined;
}

/**
 * Load the typeful-api config file from the current directory (or parent).
 * Returns an empty object if no config file is found.
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<TypefulApiConfig> {
  const configPath = findConfigFile(cwd);
  if (!configPath) {
    return {};
  }

  // JSON files can be read directly
  if (configPath.endsWith('.json')) {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as TypefulApiConfig;
  }

  // Use jiti to load TypeScript/ESM config files
  const jiti = createJiti(import.meta.url, {
    interopDefault: true,
    moduleCache: false,
  });

  const module = await jiti.import(configPath);

  if (module && typeof module === 'object') {
    const mod = module as Record<string, unknown>;
    // Support: export default { ... }
    if (mod.default && typeof mod.default === 'object') {
      return mod.default as TypefulApiConfig;
    }
    // Support: module.exports = { ... } or named export
    return mod as TypefulApiConfig;
  }

  return {};
}

/**
 * Helper to define a typeful-api config with type checking.
 *
 * @example
 * ```ts
 * // typeful.config.ts
 * import { defineConfig } from '@typeful-api/cli';
 *
 * export default defineConfig({
 *   spec: {
 *     contract: './src/api.ts',
 *     out: './openapi.json',
 *     title: 'My API',
 *     apiVersion: '1.0.0',
 *     servers: ['https://api.example.com'],
 *   },
 *   client: {
 *     spec: './openapi.json',
 *     out: './src/client.d.ts',
 *   },
 * });
 * ```
 */
export function defineConfig(config: TypefulApiConfig): TypefulApiConfig {
  return config;
}
