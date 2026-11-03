import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FSWatcher } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { watchFile } from '../../src/watch';

// File system events are delivered asynchronously (FSEvents on macOS can take a while under
// load), so each test waits for the watcher to start and drops late events from the setup.
const SETTLE_MS = 300;
const EVENT_TIMEOUT_MS = 5000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('watchFile', () => {
  let dir: string;
  let file: string;
  let watcher: FSWatcher | undefined;
  let onChange: Mock<() => void>;

  const startWatching = async () => {
    onChange = vi.fn();
    watcher = watchFile(file, onChange, 20);
    await sleep(SETTLE_MS);
    onChange.mockClear();
  };

  const atomicSave = (content: string) => {
    const tmp = path.join(dir, 'api.ts.tmp');
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, file);
  };

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
    await startWatching();

    fs.writeFileSync(file, 'export const v = 2;');

    await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: EVENT_TIMEOUT_MS });
  });

  it('fires on an atomic save that renames a new file over the original', async () => {
    await startWatching();

    atomicSave('export const v = 3;');

    await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: EVENT_TIMEOUT_MS });
  });

  it('keeps firing after an atomic save', async () => {
    await startWatching();

    atomicSave('export const v = 3;');
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: EVENT_TIMEOUT_MS });
    await sleep(SETTLE_MS);
    onChange.mockClear();

    fs.writeFileSync(file, 'export const v = 4;');
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: EVENT_TIMEOUT_MS });
  });

  it('ignores other files in the same directory', async () => {
    await startWatching();

    fs.writeFileSync(path.join(dir, 'openapi.json'), '{}');
    await sleep(SETTLE_MS);

    expect(onChange).not.toHaveBeenCalled();
  });
});
