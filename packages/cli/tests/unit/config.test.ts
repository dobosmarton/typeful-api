import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig, defineConfig } from '../../src/config';

describe('config', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'typi-config-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('loadConfig', () => {
    it('returns empty object when no config file exists', async () => {
      const config = await loadConfig(tmpDir);
      expect(config).toEqual({});
    });

    it('loads typeful.config.json', async () => {
      const configContent = {
        spec: {
          contract: './src/api.ts',
          out: './dist/openapi.json',
          title: 'My API',
          apiVersion: '2.0.0',
        },
        client: {
          spec: './dist/openapi.json',
          out: './src/types.d.ts',
        },
      };

      fs.writeFileSync(
        path.join(tmpDir, 'typeful.config.json'),
        JSON.stringify(configContent),
        'utf-8',
      );

      const config = await loadConfig(tmpDir);
      expect(config.spec?.contract).toBe('./src/api.ts');
      expect(config.spec?.out).toBe('./dist/openapi.json');
      expect(config.spec?.title).toBe('My API');
      expect(config.spec?.apiVersion).toBe('2.0.0');
      expect(config.client?.spec).toBe('./dist/openapi.json');
      expect(config.client?.out).toBe('./src/types.d.ts');
    });

    it('loads typeful.config.js with module.exports', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'typeful.config.js'),
        `module.exports = {
          spec: { title: 'JS Config API' },
        };`,
        'utf-8',
      );

      const config = await loadConfig(tmpDir);
      expect(config.spec?.title).toBe('JS Config API');
    });

    it('loads typeful.config.mjs with default export', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'typeful.config.mjs'),
        `export default {
          spec: { title: 'MJS Config API' },
        };`,
        'utf-8',
      );

      const config = await loadConfig(tmpDir);
      expect(config.spec?.title).toBe('MJS Config API');
    });

    it('prioritizes .ts over .js', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'typeful.config.ts'),
        `export default {
          spec: { title: 'TS Config' },
        };`,
        'utf-8',
      );

      fs.writeFileSync(
        path.join(tmpDir, 'typeful.config.js'),
        `module.exports = {
          spec: { title: 'JS Config' },
        };`,
        'utf-8',
      );

      const config = await loadConfig(tmpDir);
      expect(config.spec?.title).toBe('TS Config');
    });

    it('walks up parent directories to find config', async () => {
      const childDir = path.join(tmpDir, 'packages', 'api');
      fs.mkdirSync(childDir, { recursive: true });

      fs.writeFileSync(
        path.join(tmpDir, 'typeful.config.json'),
        JSON.stringify({ spec: { title: 'Root Config' } }),
        'utf-8',
      );

      const config = await loadConfig(childDir);
      expect(config.spec?.title).toBe('Root Config');
    });

    it('loads partial config (spec only)', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'typeful.config.json'),
        JSON.stringify({ spec: { title: 'Partial' } }),
        'utf-8',
      );

      const config = await loadConfig(tmpDir);
      expect(config.spec?.title).toBe('Partial');
      expect(config.client).toBeUndefined();
    });

    it('loads config with servers array', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'typeful.config.json'),
        JSON.stringify({
          spec: {
            servers: ['https://api.example.com', 'https://staging.example.com'],
          },
        }),
        'utf-8',
      );

      const config = await loadConfig(tmpDir);
      expect(config.spec?.servers).toEqual([
        'https://api.example.com',
        'https://staging.example.com',
      ]);
    });
  });

  describe('defineConfig', () => {
    it('returns the config object as-is (identity function for type checking)', () => {
      const config = defineConfig({
        spec: {
          contract: './src/api.ts',
          title: 'Test',
        },
      });

      expect(config.spec?.contract).toBe('./src/api.ts');
      expect(config.spec?.title).toBe('Test');
    });

    it('accepts empty config', () => {
      const config = defineConfig({});
      expect(config).toEqual({});
    });

    it('accepts full config', () => {
      const config = defineConfig({
        spec: {
          contract: './src/api.ts',
          out: './openapi.json',
          title: 'Full API',
          apiVersion: '3.0.0',
          description: 'A full config',
          servers: ['https://api.example.com'],
          pretty: false,
        },
        client: {
          spec: './openapi.json',
          out: './src/client.d.ts',
        },
      });

      expect(config.spec?.title).toBe('Full API');
      expect(config.spec?.pretty).toBe(false);
      expect(config.client?.out).toBe('./src/client.d.ts');
    });
  });
});
