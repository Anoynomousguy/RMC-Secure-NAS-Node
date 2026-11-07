import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { dirSize } from '../src/lib/fsutil.js';
import { getUserQuota, parseRepquotaOutput } from '../src/lib/quota.js';

const REPQUOTA_FIXTURE = `*** Report for user quotas on device /dev/sda1
Block grace time: 7days; Inode grace time: 7days
                        Block limits                File limits
User            used    soft    hard  grace    used  soft  hard  grace
----------------------------------------------------------------------
root      --   20000       0       0              5     0     0
alice     --  524288 1048576 2097152              3     0     0
legacy     1000       0       0                   3     0     0
bob       +-     999       0       0             10     0     0
`;

describe('quota parsing', () => {
  test('parses used and hard limit from repquota output', () => {
    assert.deepEqual(parseRepquotaOutput(REPQUOTA_FIXTURE, 'alice'), {
      usedBytes: 524288 * 1024,
      limitBytes: 2097152 * 1024
    });
  });

  test('handles rows with a status column but zero limits', () => {
    assert.deepEqual(parseRepquotaOutput(REPQUOTA_FIXTURE, 'bob'), {
      usedBytes: 999 * 1024,
      limitBytes: null
    });
  });

  test('handles rows without the status column', () => {
    assert.deepEqual(parseRepquotaOutput(REPQUOTA_FIXTURE, 'legacy'), {
      usedBytes: 1000 * 1024,
      limitBytes: null
    });
  });

  test('returns null for unknown users', () => {
    assert.equal(parseRepquotaOutput(REPQUOTA_FIXTURE, 'nobody'), null);
  });
});

describe('quota resolution', () => {
  test('falls back to directory size when repquota is unavailable (hidden files skipped)', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'nas-quota-'));
    try {
      await fsp.mkdir(path.join(dir, 'sub'), { recursive: true });
      await fsp.writeFile(path.join(dir, 'a.bin'), Buffer.alloc(1000));
      await fsp.writeFile(path.join(dir, 'sub', 'b.bin'), Buffer.alloc(500));
      await fsp.writeFile(path.join(dir, '.hidden.bin'), Buffer.alloc(4096));

      const failingRunner = async () => {
        throw new Error('spawn repquota ENOENT');
      };
      const quota = await getUserQuota({ username: 'alice', rootDir: dir, limitBytes: 1234, runner: failingRunner });
      assert.deepEqual(quota, { usedBytes: 1500, limitBytes: 1234, source: 'fallback' });
      assert.equal(await dirSize(dir), 1500);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  test('uses repquota output when the runner succeeds', async () => {
    const runner = async () => ({ stdout: REPQUOTA_FIXTURE, stderr: '' });
    const quota = await getUserQuota({ username: 'alice', rootDir: '/nonexistent', limitBytes: 42, runner });
    assert.deepEqual(quota, { usedBytes: 524288 * 1024, limitBytes: 2097152 * 1024, source: 'repquota' });
  });

  test('falls back when repquota does not know the user', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'nas-quota-'));
    try {
      await fsp.writeFile(path.join(dir, 'x.bin'), Buffer.alloc(64));
      const runner = async () => ({ stdout: REPQUOTA_FIXTURE, stderr: '' });
      const quota = await getUserQuota({ username: 'unknown-user', rootDir: dir, limitBytes: 99, runner });
      assert.deepEqual(quota, { usedBytes: 64, limitBytes: 99, source: 'fallback' });
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});
