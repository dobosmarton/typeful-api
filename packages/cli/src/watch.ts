import fs from 'node:fs';
import path from 'node:path';

/**
 * Calls `onChange` whenever `filePath` is edited.
 *
 * Watches the parent directory instead of the file itself: editors that save by writing a
 * new file and renaming it over the old one (atomic save) replace the watched inode, which a
 * plain file watcher reports as `rename` and then stops following. Events are debounced
 * because a single save often emits several of them.
 */
export const watchFile = (
  filePath: string,
  onChange: () => void | Promise<void>,
  debounceMs = 100,
): fs.FSWatcher => {
  const absolutePath = path.resolve(filePath);
  const fileName = path.basename(absolutePath);
  let timer: NodeJS.Timeout | undefined;

  return fs.watch(path.dirname(absolutePath), (_event, changed) => {
    // Some platforms omit the file name; treat that as a possible change to our file
    if (changed !== null && changed.toString() !== fileName) return;

    clearTimeout(timer);
    timer = setTimeout(() => {
      if (fs.existsSync(absolutePath)) void onChange();
    }, debounceMs);
  });
};
