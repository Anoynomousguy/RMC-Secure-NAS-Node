import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirSize } from './fsutil.js';

const execFileAsync = promisify(execFile);

/**
 * Parses `repquota -u /` output and returns the block usage/limit for one
 * user, or null when the user has no row.
 *
 * Typical row (status column optional on some systems):
 *   alice     --  524288 1048576 2097152  none  3  0  0
 * Blocks are 1 KiB each, so bytes = blocks * 1024.
 *
 * @returns {{ usedBytes: number, limitBytes: number|null } | null}
 */
export function parseRepquotaOutput(text, username) {
  for (const rawLine of String(text).split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#') || line.startsWith('-') || line.startsWith('***')) continue;
    const tokens = line.split(/\s+/u);
    if (tokens[0] !== username) continue;
    let i = 1;
    if (/^[+-]{1,2}$/u.test(tokens[i] ?? '')) i += 1; // skip the "--"/"+-" status column
    const used = Number.parseInt(tokens[i] ?? '', 10);
    const soft = Number.parseInt(tokens[i + 1] ?? '', 10);
    const hard = Number.parseInt(tokens[i + 2] ?? '', 10);
    if (!Number.isFinite(used)) continue;
    const BLOCK_BYTES = 1024;
    const limitBlocks = Number.isFinite(hard) && hard > 0 ? hard : (Number.isFinite(soft) && soft > 0 ? soft : null);
    return {
      usedBytes: used * BLOCK_BYTES,
      limitBytes: limitBlocks === null ? null : limitBlocks * BLOCK_BYTES
    };
  }
  return null;
}

/**
 * Returns { usedBytes, limitBytes, source } for a user directory.
 * Tries `repquota -u /` first (fixed args, never user input); falls back to
 * computing the directory size when repquota is unavailable, exits non-zero,
 * or does not know the user.
 */
export async function getUserQuota({ username, rootDir, limitBytes, runner = execFileAsync }) {
  try {
    const { stdout } = await runner('repquota', ['-u', '/'], { timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
    const parsed = parseRepquotaOutput(stdout, username);
    if (parsed) {
      return {
        usedBytes: parsed.usedBytes,
        limitBytes: parsed.limitBytes ?? limitBytes,
        source: 'repquota'
      };
    }
  } catch {
    // repquota missing / not permitted / failed: fall through
  }
  const usedBytes = await dirSize(rootDir);
  return { usedBytes, limitBytes, source: 'fallback' };
}
