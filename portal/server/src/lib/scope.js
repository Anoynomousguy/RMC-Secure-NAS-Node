import fsp from 'node:fs/promises';
import path from 'node:path';
import { ApiError } from './errors.js';
import { resolveInRoot, validateUserParam } from './paths.js';

async function canonicalize(p) {
  try {
    return await fsp.realpath(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * Resolves the filesystem scope for a request.
 *  - normal user: ${DATA_DIR}/${user}
 *  - admin: ${DATA_DIR} (optionally scoped to ?user=<name>)
 * The resulting root is canonicalized and verified to stay inside DATA_DIR
 * (defense in depth against DATA_DIR/<user> being a symlink elsewhere).
 *
 * ensureRoot only creates the *own* user root (or DATA_DIR for an unscoped
 * admin); it never creates a missing directory for ?user=<name> scoping.
 */
export async function resolveScope(req, config, { ensureRoot = false } = {}) {
  const { user } = req;
  let root;
  let scopedUser;
  let scoped = false;

  if (user.role === 'admin') {
    const raw = req.query.user;
    if (raw !== undefined && typeof raw !== 'string') {
      throw new ApiError(400, 'invalid_user', 'user must be a single string');
    }
    if (typeof raw === 'string' && raw !== '') {
      scopedUser = validateUserParam(raw);
      root = resolveInRoot(config.dataDir, scopedUser);
      scoped = true;
    } else {
      scopedUser = user.username;
      root = path.resolve(config.dataDir);
      if (ensureRoot) await fsp.mkdir(root, { recursive: true }).catch(() => {});
    }
  } else {
    scopedUser = user.username;
    root = resolveInRoot(config.dataDir, scopedUser);
    if (ensureRoot) await fsp.mkdir(root, { recursive: true }).catch(() => {});
  }

  const canonicalRoot = await canonicalize(root);
  const canonicalData = await canonicalize(config.dataDir);
  if (canonicalRoot !== canonicalData && !canonicalRoot.startsWith(canonicalData + path.sep)) {
    throw new ApiError(403, 'forbidden', 'Scope resolves outside the data directory');
  }
  return { user: scopedUser, role: user.role, root: canonicalRoot, scoped };
}
