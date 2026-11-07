import fsp from 'node:fs/promises';
import path from 'node:path';
import { ApiError } from './errors.js';

const USER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;

export function isValidUserName(name) {
  return typeof name === 'string' && USER_NAME_RE.test(name) && !name.includes('..');
}

export function validateUserParam(name) {
  if (!isValidUserName(name)) {
    throw new ApiError(400, 'invalid_user', 'Invalid user name');
  }
  return name;
}

/**
 * Validates and normalizes a client-supplied *relative* path.
 * Rejects absolute paths, backslashes, null bytes, "." / ".." segments and
 * dot-prefixed (hidden) segments. Returns a clean "a/b/c" string ('' = root).
 */
export function parseRelPath(input) {
  if (input === undefined || input === null || input === '') return '';
  if (typeof input !== 'string') {
    throw new ApiError(400, 'invalid_path', 'path must be a string');
  }
  if (input.includes('\0')) {
    throw new ApiError(400, 'invalid_path', 'Invalid characters in path');
  }
  if (input.includes('\\')) {
    throw new ApiError(400, 'invalid_path', 'Backslashes are not allowed in paths');
  }
  if (path.isAbsolute(input)) {
    throw new ApiError(400, 'invalid_path', 'Absolute paths are not allowed');
  }
  const trimmed = input.replace(/\/+$/u, '');
  if (trimmed === '' || trimmed === '.') return '';
  const segments = [];
  for (const segment of trimmed.split('/')) {
    if (segment === '') continue;
    if (segment === '.' || segment === '..') {
      throw new ApiError(400, 'invalid_path', 'Relative path segments ("." / "..") are not allowed');
    }
    if (segment.startsWith('.')) {
      throw new ApiError(400, 'hidden_path', 'Hidden files and folders are not accessible');
    }
    segments.push(segment);
  }
  return segments.join('/');
}

/**
 * Resolves a validated relative path inside `root` and verifies with a
 * trailing-separator prefix check that the result stays inside the root.
 */
export function resolveInRoot(root, rel = '') {
  const rootResolved = path.resolve(root);
  const segments = String(rel).split('/').filter((segment) => segment !== '');
  const abs = path.resolve(rootResolved, ...segments);
  if (abs !== rootResolved && !abs.startsWith(rootResolved + path.sep)) {
    throw new ApiError(400, 'invalid_path', 'Path escapes the allowed root');
  }
  return abs;
}

/**
 * Defense in depth against symlink escapes: if the target exists, its real
 * path must still be inside the (real) root. No-op when target does not exist
 * (the string-level check in resolveInRoot already applied).
 */
export async function assertRealPathInside(abs, root) {
  let real = null;
  try {
    real = await fsp.realpath(abs);
  } catch {
    return;
  }
  let realRoot;
  try {
    realRoot = await fsp.realpath(root);
  } catch {
    realRoot = path.resolve(root);
  }
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
    throw new ApiError(403, 'forbidden', 'Path resolves outside the allowed root (symlink)');
  }
}

/**
 * Validates a single file/folder *name* (no separators, not hidden, etc.).
 */
export function validateName(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new ApiError(400, 'invalid_name', 'name is required');
  }
  if (name.length > 255) {
    throw new ApiError(400, 'invalid_name', 'name is too long');
  }
  if (name.includes('\0') || name.includes('/') || name.includes('\\')) {
    throw new ApiError(400, 'invalid_name', 'name must not contain path separators');
  }
  if (name === '.' || name === '..') {
    throw new ApiError(400, 'invalid_name', 'Invalid name');
  }
  if (name.startsWith('.')) {
    throw new ApiError(400, 'hidden_path', 'Hidden files and folders are not allowed');
  }
  return name;
}

export function joinRel(base, name) {
  return base ? `${base}/${name}` : name;
}
