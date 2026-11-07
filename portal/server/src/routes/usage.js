import express from 'express';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { walkFiles } from '../lib/fsutil.js';
import { resolveScope } from '../lib/scope.js';

function parseDays(raw) {
  if (raw === undefined) return 7;
  if (typeof raw !== 'string' || !/^\d+$/u.test(raw)) {
    throw new ApiError(400, 'invalid_days', 'days must be an integer between 1 and 365');
  }
  const days = Number.parseInt(raw, 10);
  if (days < 1 || days > 365) {
    throw new ApiError(400, 'invalid_days', 'days must be between 1 and 365');
  }
  return days;
}

export function createUsageRouter(config) {
  const router = express.Router();

  // GET /api/usage?days=7&user=<admin-only>
  // => { totalBytes, byDay: [{ date, bytes }] }
  // totalBytes: size of every file in scope; byDay: bytes bucketed by file
  // mtime (UTC dates) for the last `days` days, zero-filled.
  router.get('/', asyncHandler(async (req, res) => {
    const days = parseDays(req.query.days);
    const scope = await resolveScope(req, config, { ensureRoot: true });

    const buckets = new Map();
    let totalBytes = 0;
    await walkFiles(scope.root, (abs, stat) => {
      totalBytes += stat.size;
      const date = new Date(stat.mtimeMs).toISOString().slice(0, 10);
      buckets.set(date, (buckets.get(date) ?? 0) + stat.size);
    });

    const now = new Date();
    const byDay = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
      const date = day.toISOString().slice(0, 10);
      byDay.push({ date, bytes: buckets.get(date) ?? 0 });
    }
    res.json({ totalBytes, byDay });
  }));

  return router;
}
