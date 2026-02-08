import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  defineApi,
  route,
  generateSpecJson,
  type ApiContract,
  type GenerateSpecOptions,
} from '@typeful-api/core';

describe('generate-spec', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'typi-spec-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('spec generation from core', () => {
    it('generates valid OpenAPI JSON from a contract object', () => {
      const api = defineApi({
        v1: {
          routes: {
            health: route.get('/health').returns(z.object({ status: z.string() })),
          },
        },
      });

      const options: GenerateSpecOptions = {
        info: { title: 'Test API', version: '1.0.0' },
      };

      const json = generateSpecJson(api, options, true);
      const spec = JSON.parse(json);

      expect(spec.openapi).toBe('3.0.0');
      expect(spec.info.title).toBe('Test API');
      expect(spec.paths['/v1/health']).toBeDefined();
      expect(spec.paths['/v1/health'].get).toBeDefined();
    });

    it('generates spec with servers', () => {
      const api = defineApi({
        v1: {
          routes: {
            test: route.get('/test').returns(z.string()),
          },
        },
      });

      const json = generateSpecJson(
        api,
        {
          info: { title: 'API', version: '1.0.0' },
          servers: [{ url: 'https://api.example.com' }],
        },
        true,
      );

      const spec = JSON.parse(json);
      expect(spec.servers).toHaveLength(1);
      expect(spec.servers[0].url).toBe('https://api.example.com');
    });

    it('writes spec to file', () => {
      const api = defineApi({
        v1: {
          routes: {
            test: route.get('/test').returns(z.string()),
          },
        },
      });

      const json = generateSpecJson(api, {
        info: { title: 'API', version: '1.0.0' },
      });

      const outPath = path.join(tmpDir, 'openapi.json');
      fs.writeFileSync(outPath, json, 'utf-8');

      expect(fs.existsSync(outPath)).toBe(true);
      const written = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
      expect(written.openapi).toBe('3.0.0');
    });

    it('generates minified JSON when pretty=false', () => {
      const api = defineApi({
        v1: {
          routes: {
            test: route.get('/test').returns(z.string()),
          },
        },
      });

      const pretty = generateSpecJson(api, { info: { title: 'API', version: '1.0.0' } }, true);
      const minified = generateSpecJson(api, { info: { title: 'API', version: '1.0.0' } }, false);

      expect(pretty.length).toBeGreaterThan(minified.length);
      expect(pretty).toContain('\n');
      expect(minified).not.toContain('\n');
    });
  });
});
