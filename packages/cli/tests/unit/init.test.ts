import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initCommand } from '../../src/commands/init';

describe('init command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'typi-test-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('hono template', () => {
    it('creates all expected files', async () => {
      const dir = path.join(tmpDir, 'hono-project');
      await initCommand({ template: 'hono', dir });

      expect(fs.existsSync(path.join(dir, 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'tsconfig.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, '.gitignore'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'src/api.ts'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'src/index.ts'))).toBe(true);
    });

    it('generates valid package.json with hono dependencies', async () => {
      const dir = path.join(tmpDir, 'hono-project');
      await initCommand({ template: 'hono', dir });

      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
      expect(pkg.name).toBe('hono-project');
      expect(pkg.dependencies).toHaveProperty('hono');
      expect(pkg.dependencies).toHaveProperty('@typeful-api/core');
      expect(pkg.dependencies).toHaveProperty('@typeful-api/hono');
      expect(pkg.dependencies).toHaveProperty('@hono/node-server');
      expect(pkg.dependencies).toHaveProperty('zod');
    });
  });

  describe('express template', () => {
    it('creates all expected files', async () => {
      const dir = path.join(tmpDir, 'express-project');
      await initCommand({ template: 'express', dir });

      expect(fs.existsSync(path.join(dir, 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'tsconfig.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'src/api.ts'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'src/index.ts'))).toBe(true);
    });

    it('generates valid package.json with express dependencies', async () => {
      const dir = path.join(tmpDir, 'express-project');
      await initCommand({ template: 'express', dir });

      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
      expect(pkg.dependencies).toHaveProperty('express');
      expect(pkg.dependencies).toHaveProperty('@typeful-api/express');
      expect(pkg.dependencies).not.toHaveProperty('hono');
    });
  });

  describe('fastify template', () => {
    it('creates all expected files', async () => {
      const dir = path.join(tmpDir, 'fastify-project');
      await initCommand({ template: 'fastify', dir });

      expect(fs.existsSync(path.join(dir, 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'tsconfig.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'src/api.ts'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'src/index.ts'))).toBe(true);
    });

    it('generates valid package.json with fastify dependencies', async () => {
      const dir = path.join(tmpDir, 'fastify-project');
      await initCommand({ template: 'fastify', dir });

      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
      expect(pkg.dependencies).toHaveProperty('fastify');
      expect(pkg.dependencies).toHaveProperty('@typeful-api/fastify');
      expect(pkg.dependencies).not.toHaveProperty('hono');
      expect(pkg.dependencies).not.toHaveProperty('express');
    });
  });

  describe('shared template content', () => {
    it('generates valid tsconfig.json', async () => {
      const dir = path.join(tmpDir, 'test-project');
      await initCommand({ template: 'hono', dir });

      const tsconfig = JSON.parse(fs.readFileSync(path.join(dir, 'tsconfig.json'), 'utf-8'));
      expect(tsconfig.compilerOptions.strict).toBe(true);
      expect(tsconfig.compilerOptions.module).toBe('ESNext');
    });

    it('api.ts uses pagination and error helpers', async () => {
      const dir = path.join(tmpDir, 'test-project');
      await initCommand({ template: 'hono', dir });

      const apiContent = fs.readFileSync(path.join(dir, 'src/api.ts'), 'utf-8');
      expect(apiContent).toContain('paginationQuery');
      expect(apiContent).toContain('paginated');
      expect(apiContent).toContain('withErrors');
    });

    it('.gitignore includes node_modules and dist', async () => {
      const dir = path.join(tmpDir, 'test-project');
      await initCommand({ template: 'hono', dir });

      const gitignore = fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8');
      expect(gitignore).toContain('node_modules');
      expect(gitignore).toContain('dist');
    });
  });

  describe('options', () => {
    it('uses custom project name', async () => {
      const dir = path.join(tmpDir, 'custom');
      await initCommand({ template: 'hono', dir, name: 'my-custom-api' });

      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
      expect(pkg.name).toBe('my-custom-api');
    });

    it('defaults name to directory name', async () => {
      const dir = path.join(tmpDir, 'my-api-project');
      await initCommand({ template: 'hono', dir });

      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
      expect(pkg.name).toBe('my-api-project');
    });

    it('creates target directory if it does not exist', async () => {
      const dir = path.join(tmpDir, 'new-dir', 'nested');
      expect(fs.existsSync(dir)).toBe(false);

      await initCommand({ template: 'hono', dir });

      expect(fs.existsSync(dir)).toBe(true);
      expect(fs.existsSync(path.join(dir, 'package.json'))).toBe(true);
    });
  });

  describe('error cases', () => {
    it('exits with error for invalid template', async () => {
      await initCommand({ template: 'invalid', dir: path.join(tmpDir, 'test') });
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('exits with error for non-empty directory', async () => {
      const dir = path.join(tmpDir, 'non-empty');
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'existing.txt'), 'content');

      await initCommand({ template: 'hono', dir });
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });
});
