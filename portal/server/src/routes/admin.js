import fsp from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { asyncHandler } from '../lib/errors.js';
import { countEntries } from '../lib/fsutil.js';
import { getUserQuota } from '../lib/quota.js';
import { requireAdmin } from '../middleware/auth.js';

export function createAdminRouter(config) {
  const router = express.Router();

  // GET /api/admin/users (admin only)
  // => { users: [{ user, root, usedBytes, limitBytes, entries }] }
  router.get('/users', requireAdmin, asyncHandler(async (req, res) => {
    let dirents = [];
    try {
      dirents = await fsp.readdir(config.dataDir, { withFileTypes: true });
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    const users = [];
    for (const dirent of dirents) {
      if (!dirent.isDirectory()) continue;
      if (dirent.name.startsWith('.')) continue; // hides .tmp staging dir and dotfiles
      const root = path.join(config.dataDir, dirent.name);
      const quota = await getUserQuota({
        username: dirent.name,
        rootDir: root,
        limitBytes: config.quotaLimitBytes
      });
      const entries = await countEntries(root);
      users.push({
        user: dirent.name,
        root,
        usedBytes: quota.usedBytes,
        limitBytes: quota.limitBytes,
        entries
      });
    }
    users.sort((a, b) => a.user.localeCompare(b.user));
    res.json({ users });
  }));

  return router;
}
