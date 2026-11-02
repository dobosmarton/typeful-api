import { readFileSync } from 'node:fs';

/**
 * Version of this CLI package, read from its package.json at runtime.
 * Resolves the same from src/ (tests) and from the bundled dist/ (published),
 * since both sit one level below the package root.
 */
export const CLI_VERSION: string = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;
