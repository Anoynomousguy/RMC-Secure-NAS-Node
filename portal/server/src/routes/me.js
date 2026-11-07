import express from 'express';
import { asyncHandler } from '../lib/errors.js';
import { getUserQuota } from '../lib/quota.js';
import { resolveScope } from '../lib/scope.js';

export function createMeRouter(config) {
  const router = express.Router();

  // GET /api/me => { user, role, root, quota: { usedBytes, limitBytes } }
  router.get('/', asyncHandler(async (req, res) => {
    const scope = await resolveScope(req, config, { ensureRoot: true });
    const quota = await getUserQuota({
      username: scope.user,
      rootDir: scope.root,
      limitBytes: config.quotaLimitBytes
    });
    res.json({
      user: req.user.username,
      role: req.user.role,
      root: scope.root,
      quota: { usedBytes: quota.usedBytes, limitBytes: quota.limitBytes }
    });
  }));

  return router;
}
