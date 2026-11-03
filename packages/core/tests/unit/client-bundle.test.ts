import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const entry = fileURLToPath(new URL('../../src/client/index.ts', import.meta.url));

/**
 * The client runs in browsers, so its entry must not pull in the spec generator, server-side
 * helpers or Node built-ins. zod is a peer dependency and stays external.
 */
describe('client bundle', () => {
  it('only contains browser-safe modules and stays small', async () => {
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      minify: true,
      write: false,
      metafile: true,
      external: ['zod'],
      logLevel: 'silent',
    });

    const inputs = Object.keys(result.metafile.inputs);
    const bytes = result.outputFiles[0]?.contents.byteLength ?? 0;

    expect(
      inputs.filter((file) => /src\/(spec|route)\.ts$|src\/(server|errors)\//.test(file)),
    ).toEqual([]);
    expect(inputs.filter((file) => file.startsWith('node:'))).toEqual([]);
    expect(bytes).toBeLessThan(10_000);
  });
});
