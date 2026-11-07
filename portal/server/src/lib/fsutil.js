import fsp from 'node:fs/promises';
import path from 'node:path';
import mime from 'mime-types';

export async function lstatOrNull(absPath) {
  try {
    return await fsp.lstat(absPath);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return null;
    throw err;
  }
}

/**
 * Recursively sums file sizes. Skips hidden entries and symlinks so a scope
 * can never be escaped and staging/hidden dirs are not counted.
 */
export async function dirSize(rootDir) {
  let total = 0;
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    let dirents;
    try {
      dirents = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const dirent of dirents) {
      if (dirent.name.startsWith('.')) continue;
      if (dirent.isSymbolicLink()) continue;
      const abs = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        stack.push(abs);
        continue;
      }
      if (!dirent.isFile()) continue;
      const stat = await lstatOrNull(abs);
      if (stat && stat.isFile()) total += stat.size;
    }
  }
  return total;
}

/**
 * Number of direct (non-hidden, non-symlink) entries in a directory.
 */
export async function countEntries(rootDir) {
  let dirents;
  try {
    dirents = await fsp.readdir(rootDir, { withFileTypes: true });
  } catch {
    return 0;
  }
  return dirents.filter((dirent) => !dirent.name.startsWith('.') && !dirent.isSymbolicLink()).length;
}

/**
 * Walks every regular file under rootDir (skipping hidden entries and
 * symlinks) and invokes onFile(absPath, stat). Used by /api/usage.
 */
export async function walkFiles(rootDir, onFile) {
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    let dirents;
    try {
      dirents = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const dirent of dirents) {
      if (dirent.name.startsWith('.')) continue;
      if (dirent.isSymbolicLink()) continue;
      const abs = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        stack.push(abs);
        continue;
      }
      if (!dirent.isFile()) continue;
      const stat = await lstatOrNull(abs);
      if (stat && stat.isFile()) onFile(abs, stat);
    }
  }
}

/**
 * Directory listing entries: { name, type: "file"|"folder", size, modified (ISO), mime }
 * Hidden entries and symlinks are hidden. Folders sort first, then name
 * (case-insensitive, natural order).
 */
export async function listDirectory(dirAbs) {
  const dirents = await fsp.readdir(dirAbs, { withFileTypes: true });
  const entries = [];
  for (const dirent of dirents) {
    if (dirent.name.startsWith('.')) continue;
    if (dirent.isSymbolicLink()) continue;
    const abs = path.join(dirAbs, dirent.name);
    const stat = await lstatOrNull(abs);
    if (!stat) continue;
    if (stat.isDirectory()) {
      entries.push({
        name: dirent.name,
        type: 'folder',
        size: 0,
        modified: stat.mtime.toISOString(),
        mime: null
      });
    } else if (stat.isFile()) {
      entries.push({
        name: dirent.name,
        type: 'file',
        size: stat.size,
        modified: stat.mtime.toISOString(),
        mime: mime.lookup(dirent.name) || 'application/octet-stream'
      });
    }
  }
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
  });
  return entries;
}
