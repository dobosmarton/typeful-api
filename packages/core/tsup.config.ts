import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', client: 'src/client/index.ts' },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  minify: false,
});
