import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FSWatcher } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchFile } from '../../src/watch';

describe('watchFile', () => {
  let dir: string;
  let file: string;
  let watcher: FSWatcher | undefined;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typeful-watch-'));
    file = path.join(dir, 'api.ts');
    fs.writeFileSync(file, 'export const v = 1;');
  });

  afterEach(() => {
    watcher?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('fires on an in-place write', async () => {
    const onChange = vi.fn();
    watcher = watchFile(file, onChange, 20);

    fs.writeFileSync(file, 'export const v = 2;');

    await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 2000 });
  });

  it('fires on an atomic save that renames a new file over the original', async () => {
    const onChange = vi.fn();
    watcher = watchFile(file, onChange, 20);

    const tmp = path.join(dir, 'api.ts.tmp');
    fs.writeFileSync(tmp, 'export const v = 3;');
    fs.renameSync(tmp, file);

    await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 2000 });
  });

  it('keeps firing after an atomic save', async () => {
    const onChange = vi.fn();
    watcher = watchFile(file, onChange, 20);

    const tmp = path.join(dir, 'api.ts.tmp');
    fs.writeFileSync(tmp, 'export const v = 3;');
    fs.renameSync(tmp, file);
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(1), { timeout: 2000 });

    fs.writeFileSync(file, 'export const v = 4;');
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(2), { timeout: 2000 });
  });

  it('ignores other files in the same directory', async () => {
    const onChange = vi.fn();
    watcher = watchFile(file, onChange, 20);
    // macOS FSEvents can deliver the setup's own creation of api.ts late; let it settle first
    await new Promise((resolve) => setTimeout(resolve, 300));
    onChange.mockClear();

    fs.writeFileSync(path.join(dir, 'openapi.json'), '{}');
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(onChange).not.toHaveBeenCalled();
  });
});
