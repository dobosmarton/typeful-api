import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateClientCommand } from '../../src/commands/generate-client';

// Minimal valid OpenAPI 3.0 spec for testing
const minimalSpec = {
  openapi: '3.0.0',
  info: { title: 'Test', version: '1.0.0' },
  paths: {
    '/v1/items': {
      get: {
        operationId: 'v1_items_list',
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                        },
                        required: ['id', 'name'],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

describe('generate-client', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'typi-client-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates TypeScript types from a valid spec', async () => {
    const specPath = path.join(tmpDir, 'openapi.json');
    const outPath = path.join(tmpDir, 'client.d.ts');
    fs.writeFileSync(specPath, JSON.stringify(minimalSpec), 'utf-8');

    await generateClientCommand({
      spec: specPath,
      out: outPath,
    });

    expect(fs.existsSync(outPath)).toBe(true);
    const content = fs.readFileSync(outPath, 'utf-8');
    // openapi-typescript output should contain type definitions
    expect(content.length).toBeGreaterThan(0);
  });

  it('exits with error when spec file does not exist', async () => {
    await generateClientCommand({
      spec: path.join(tmpDir, 'nonexistent.json'),
      out: path.join(tmpDir, 'out.d.ts'),
    });

    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('exits with error for invalid JSON', async () => {
    const specPath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(specPath, 'not valid json', 'utf-8');

    await generateClientCommand({
      spec: specPath,
      out: path.join(tmpDir, 'out.d.ts'),
    });

    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('creates output directory if it does not exist', async () => {
    const specPath = path.join(tmpDir, 'openapi.json');
    const outPath = path.join(tmpDir, 'nested', 'dir', 'client.d.ts');
    fs.writeFileSync(specPath, JSON.stringify(minimalSpec), 'utf-8');

    await generateClientCommand({
      spec: specPath,
      out: outPath,
    });

    expect(fs.existsSync(outPath)).toBe(true);
  });
});
