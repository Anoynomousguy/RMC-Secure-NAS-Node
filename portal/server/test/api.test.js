import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import request from 'supertest';

// Env must be set before importing the app.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nas-portal-test-'));
const dataDir = path.join(tmpRoot, 'data');
process.env.DATA_DIR = dataDir;
process.env.TRUST_PROXY_AUTH = 'true';
process.env.LOG_REQUESTS = 'false';
process.env.QUOTA_LIMIT_BYTES = String(50 * 1024 * 1024);
delete process.env.DEV_USER;
delete process.env.DEV_ROLE;

const { createApp } = await import('../src/app.js');

const aliceHeaders = { 'Remote-User': 'alice', 'Remote-Groups': 'users' };
const adminHeaders = { 'Remote-User': 'root-admin', 'Remote-Groups': 'users, Admins' };

const aliceDir = path.join(dataDir, 'alice');
const bobDir = path.join(dataDir, 'bob');

let app;
let devApp;
let devAdminApp;
let tinyUploadApp;
let lowQuotaApp;
let enforcedQuotaApp;
let staticApp;

before(async () => {
  await fsp.mkdir(path.join(aliceDir, 'documents'), { recursive: true });
  await fsp.mkdir(path.join(aliceDir, 'photos'), { recursive: true });
  await fsp.mkdir(bobDir, { recursive: true });
  await fsp.writeFile(path.join(aliceDir, 'notes.txt'), 'hello world');
  await fsp.writeFile(path.join(aliceDir, '.hidden'), 'secret');
  await fsp.writeFile(path.join(aliceDir, 'documents', 'report.txt'), 'quarterly report');
  await fsp.writeFile(path.join(bobDir, 'bob.txt'), 'bob file');

  app = createApp();
  devApp = createApp({ trustProxyAuth: false });
  devAdminApp = createApp({ trustProxyAuth: false, devUser: 'devuser', devRole: 'admin' });
  tinyUploadApp = createApp({ maxUploadMb: 1 });
  lowQuotaApp = createApp({ quotaLimitBytes: 10 });
  enforcedQuotaApp = createApp({ quotaLimitBytes: 10, enforceQuotaAdmins: true });
  staticApp = createApp({ staticDir: path.join(tmpRoot, 'no-dist') });
});

after(async () => {
  await fsp.rm(tmpRoot, { recursive: true, force: true });
});

describe('health', () => {
  test('GET /api/health needs no auth and reports a version', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(typeof res.body.version, 'string');
    assert.ok(res.body.version.length > 0);
  });
});

describe('auth & identity', () => {
  test('proxy headers identify a normal user', async () => {
    const res = await request(app).get('/api/me').set(aliceHeaders);
    assert.equal(res.status, 200);
    assert.equal(res.body.user, 'alice');
    assert.equal(res.body.role, 'user');
    assert.equal(res.body.root, aliceDir);
    assert.equal(typeof res.body.quota.usedBytes, 'number');
    assert.ok(res.body.quota.usedBytes >= 11);
    assert.equal(typeof res.body.quota.limitBytes, 'number');
    assert.ok(res.body.quota.limitBytes > 0);
  });

  test('admins group grants admin role (case-insensitive, comma or space separated)', async () => {
    const comma = await request(app).get('/api/me').set(adminHeaders);
    assert.equal(comma.status, 200);
    assert.equal(comma.body.role, 'admin');
    assert.equal(comma.body.root, dataDir);

    const spaced = await request(app).get('/api/me').set({
      'Remote-User': 'root-admin',
      'Remote-Groups': 'everyone ADMINS'
    });
    assert.equal(spaced.body.role, 'admin');
  });

  test('missing identity is rejected with 401', async () => {
    const res = await request(app).get('/api/me');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'unauthorized');
  });

  test('API endpoints require authentication when proxy auth is on', async () => {
    const res = await request(app).get('/api/files');
    assert.equal(res.status, 401);
  });

  test('dev fallback uses DEV_USER/DEV_ROLE defaults', async () => {
    const res = await request(devApp).get('/api/me');
    assert.equal(res.status, 200);
    assert.equal(res.body.user, 'devuser');
    assert.equal(res.body.role, 'user');
    assert.equal(res.body.root, path.join(dataDir, 'devuser'));
  });

  test('dev fallback can be admin via DEV_ROLE', async () => {
    const res = await request(devAdminApp).get('/api/me');
    assert.equal(res.body.role, 'admin');
    assert.equal(res.body.root, dataDir);
  });
});

describe('path traversal protection', () => {
  test('listing rejects traversal and absolute paths', async () => {
    for (const evil of ['../../etc/passwd', '/etc/passwd', '..', 'a/../../b', '..\\..\\windows']) {
      const res = await request(app).get('/api/files').query({ path: evil }).set(aliceHeaders);
      assert.equal(res.status, 400, `expected 400 for ${evil}`);
      assert.ok(['invalid_path', 'hidden_path'].includes(res.body.error.code), `unexpected code for ${evil}`);
    }
  });

  test('encoded traversal is rejected', async () => {
    const res = await request(app).get('/api/files?path=..%2F..%2Fetc%2Fpasswd').set(aliceHeaders);
    assert.equal(res.status, 400);
  });

  test('content endpoint rejects traversal', async () => {
    const res = await request(app).get('/api/files/content').query({ path: '../../etc/passwd' }).set(aliceHeaders);
    assert.equal(res.status, 400);
  });

  test('hidden paths are refused', async () => {
    const res = await request(app).get('/api/files').query({ path: '.hidden' }).set(aliceHeaders);
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'hidden_path');
  });

  test('null bytes are refused', async () => {
    const res = await request(app).post('/api/files/delete').set(aliceHeaders).send({ path: 'a\u0000b' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'invalid_path');
  });

  test('symlinks cannot escape the user root', async () => {
    await fsp.symlink(bobDir, path.join(aliceDir, 'escape-link'));
    await fsp.symlink(path.join(bobDir, 'bob.txt'), path.join(aliceDir, 'bob-link.txt'));

    const listing = await request(app).get('/api/files').query({ path: 'escape-link' }).set(aliceHeaders);
    assert.equal(listing.status, 403);

    const viaDir = await request(app).get('/api/files/content').query({ path: 'escape-link/bob.txt' }).set(aliceHeaders);
    assert.equal(viaDir.status, 403);

    const direct = await request(app).get('/api/files/content').query({ path: 'bob-link.txt' }).set(aliceHeaders);
    assert.equal(direct.status, 403);

    await fsp.rm(path.join(aliceDir, 'escape-link'), { force: true });
    await fsp.rm(path.join(aliceDir, 'bob-link.txt'), { force: true });
  });
});

describe('file listing', () => {
  test('lists entries sorted folders-first, hides dotfiles, ISO mtimes', async () => {
    const res = await request(app).get('/api/files').set(aliceHeaders);
    assert.equal(res.status, 200);
    assert.equal(res.body.path, '');
    const entries = res.body.entries;
    assert.ok(entries.length >= 3);
    assert.ok(!entries.some((entry) => entry.name.startsWith('.')));

    const names = entries.map((entry) => entry.name);
    assert.ok(names.includes('documents'));
    assert.ok(names.includes('photos'));
    assert.ok(names.includes('notes.txt'));

    const firstFile = entries.findIndex((entry) => entry.type === 'file');
    if (firstFile !== -1) {
      assert.ok(entries.slice(firstFile).every((entry) => entry.type === 'file'));
    }
    const sorted = [...entries].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
    });
    assert.deepEqual(
      entries.map((entry) => `${entry.name}|${entry.type}`),
      sorted.map((entry) => `${entry.name}|${entry.type}`)
    );

    const notes = entries.find((entry) => entry.name === 'notes.txt');
    assert.equal(notes.type, 'file');
    assert.equal(notes.size, 11);
    assert.equal(notes.mime, 'text/plain');
    assert.match(notes.modified, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const folder = entries.find((entry) => entry.name === 'documents');
    assert.equal(folder.type, 'folder');
    assert.equal(folder.mime, null);
  });

  test('lists subdirectories and rejects missing paths / non-directories', async () => {
    const res = await request(app).get('/api/files').query({ path: 'documents' }).set(aliceHeaders);
    assert.equal(res.status, 200);
    assert.equal(res.body.path, 'documents');
    assert.ok(res.body.entries.some((entry) => entry.name === 'report.txt'));

    const missing = await request(app).get('/api/files').query({ path: 'nope/nope' }).set(aliceHeaders);
    assert.equal(missing.status, 404);

    const notDir = await request(app).get('/api/files').query({ path: 'notes.txt' }).set(aliceHeaders);
    assert.equal(notDir.status, 400);
    assert.equal(notDir.body.error.code, 'not_a_directory');
  });
});

describe('file content & range requests', () => {
  test('streams a file as an attachment with correct headers', async () => {
    const res = await request(app).get('/api/files/content').query({ path: 'notes.txt' }).set(aliceHeaders);
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'text/plain');
    assert.match(res.headers['content-disposition'], /^attachment;/);
    assert.equal(res.headers['content-length'], '11');
    assert.equal(res.headers['accept-ranges'], 'bytes');
    assert.ok(res.text === 'hello world' || res.body.toString() === 'hello world');
  });

  test('supports HTTP Range requests (206, 416)', async () => {
    const mid = await request(app)
      .get('/api/files/content')
      .query({ path: 'notes.txt' })
      .set({ ...aliceHeaders, Range: 'bytes=0-4' });
    assert.equal(mid.status, 206);
    assert.equal(mid.headers['content-range'], 'bytes 0-4/11');
    assert.equal(mid.headers['content-length'], '5');

    const openEnded = await request(app)
      .get('/api/files/content')
      .query({ path: 'notes.txt' })
      .set({ ...aliceHeaders, Range: 'bytes=6-' });
    assert.equal(openEnded.status, 206);
    assert.equal(openEnded.headers['content-range'], 'bytes 6-10/11');

    const bad = await request(app)
      .get('/api/files/content')
      .query({ path: 'notes.txt' })
      .set({ ...aliceHeaders, Range: 'bytes=99-' });
    assert.equal(bad.status, 416);
    assert.equal(bad.headers['content-range'], 'bytes */11');
  });

  test('rejects directories and dotfiles', async () => {
    const dir = await request(app).get('/api/files/content').query({ path: 'documents' }).set(aliceHeaders);
    assert.equal(dir.status, 400);
    const hidden = await request(app).get('/api/files/content').query({ path: '.hidden' }).set(aliceHeaders);
    assert.equal(hidden.status, 400);
    assert.equal(hidden.body.error.code, 'hidden_path');
  });
});

describe('upload', () => {
  test('uploads multiple files and reports sizes', async () => {
    const res = await request(app)
      .post('/api/files/upload')
      .query({ path: 'documents' })
      .set(aliceHeaders)
      .attach('files', Buffer.from('alpha'), 'alpha.txt')
      .attach('files', Buffer.from('beta beta'), 'beta.txt');
    assert.equal(res.status, 200);
    assert.equal(res.body.uploaded.length, 2);
    assert.equal(res.body.errors.length, 0);
    for (const item of res.body.uploaded) {
      assert.equal(typeof item.name, 'string');
      assert.equal(typeof item.size, 'number');
    }
    assert.equal(await fsp.readFile(path.join(aliceDir, 'documents', 'alpha.txt'), 'utf8'), 'alpha');
    assert.equal(await fsp.readFile(path.join(aliceDir, 'documents', 'beta.txt'), 'utf8'), 'beta beta');
  });

  test('returns 207 with per-file errors on partial failure', async () => {
    const res = await request(app)
      .post('/api/files/upload')
      .set(aliceHeaders)
      .attach('files', Buffer.from('ok'), 'good.txt')
      .attach('files', Buffer.from('bad'), '.secret');
    assert.equal(res.status, 207);
    assert.equal(res.body.uploaded.length, 1);
    assert.equal(res.body.errors.length, 1);
    assert.equal(res.body.errors[0].name, '.secret');
    assert.ok(res.body.errors[0].error.length > 0);
    assert.ok(fs.existsSync(path.join(aliceDir, 'good.txt')));
    assert.ok(!fs.existsSync(path.join(aliceDir, '.secret')));
  });

  test('rejects uploads without files', async () => {
    const res = await request(app).post('/api/files/upload').set(aliceHeaders).send();
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'no_files');
  });

  test('rejects overwriting an existing name', async () => {
    const res = await request(app)
      .post('/api/files/upload')
      .set(aliceHeaders)
      .attach('files', Buffer.from('again'), 'notes.txt');
    assert.equal(res.status, 400);
    assert.equal(res.body.errors.length, 1);
    assert.match(res.body.errors[0].error, /already exists/);
  });

  test('rejects files larger than MAX_UPLOAD_MB with 413', async () => {
    const res = await request(tinyUploadApp)
      .post('/api/files/upload')
      .set(aliceHeaders)
      .attach('files', Buffer.alloc(1024 * 1024 + 1, 1), 'big.bin');
    assert.equal(res.status, 413);
    assert.equal(res.body.error.code, 'file_too_large');
  });

  test('rejects more than 20 files', async () => {
    let pending = request(app).post('/api/files/upload').set(aliceHeaders);
    for (let i = 0; i < 21; i += 1) {
      pending = pending.attach('files', Buffer.from('x'), `many-${i}.txt`);
    }
    const res = await pending;
    assert.equal(res.status, 400);
    assert.ok(['too_many_files', 'unexpected_file'].includes(res.body.error.code));
  });

  test('enforces the quota for users with 413', async () => {
    const res = await request(lowQuotaApp)
      .post('/api/files/upload')
      .set(aliceHeaders)
      .attach('files', Buffer.from('0123456789'), 'over.txt');
    assert.equal(res.status, 413);
    assert.equal(res.body.error.code, 'quota_exceeded');
    assert.ok(!fs.existsSync(path.join(aliceDir, 'over.txt')));
  });

  test('admins are exempt from quota unless ENFORCE_QUOTA_ADMINS=true', async () => {
    const exempt = await request(lowQuotaApp)
      .post('/api/files/upload')
      .set(adminHeaders)
      .attach('files', Buffer.from('0123456789'), 'admin-exempt.txt');
    assert.equal(exempt.status, 200);

    const enforced = await request(enforcedQuotaApp)
      .post('/api/files/upload')
      .set(adminHeaders)
      .attach('files', Buffer.from('0123456789'), 'admin-enforced.txt');
    assert.equal(enforced.status, 413);
    assert.equal(enforced.body.error.code, 'quota_exceeded');

    await fsp.rm(path.join(dataDir, 'admin-exempt.txt'), { force: true });
  });
});

describe('folder / rename / delete', () => {
  test('creates folders, renames items, deletes files and empty folders', async () => {
    const created = await request(app).post('/api/files/folder').set(aliceHeaders).send({ path: '', name: 'projects' });
    assert.equal(created.status, 200);
    assert.deepEqual(created.body, { ok: true, path: 'projects' });
    assert.ok(fs.existsSync(path.join(aliceDir, 'projects')));

    const duplicate = await request(app).post('/api/files/folder').set(aliceHeaders).send({ path: '', name: 'projects' });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, 'already_exists');

    const renamed = await request(app).post('/api/files/rename').set(aliceHeaders).send({ path: 'projects', name: 'projects2' });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.path, 'projects2');
    assert.ok(fs.existsSync(path.join(aliceDir, 'projects2')));
    assert.ok(!fs.existsSync(path.join(aliceDir, 'projects')));

    const nested = await request(app).post('/api/files/folder').set(aliceHeaders).send({ path: 'projects2', name: 'inner' });
    assert.equal(nested.body.path, 'projects2/inner');
    assert.ok(fs.existsSync(path.join(aliceDir, 'projects2', 'inner')));

    const missing = await request(app).post('/api/files/rename').set(aliceHeaders).send({ path: 'ghost', name: 'x' });
    assert.equal(missing.status, 404);

    const deleted = await request(app).post('/api/files/delete').set(aliceHeaders).send({ path: 'projects2/inner' });
    assert.equal(deleted.status, 200);
    assert.ok(!fs.existsSync(path.join(aliceDir, 'projects2', 'inner')));

    await fsp.writeFile(path.join(aliceDir, 'to-delete.txt'), 'x');
    const fileDel = await request(app).post('/api/files/delete').set(aliceHeaders).send({ path: 'to-delete.txt' });
    assert.equal(fileDel.status, 200);
    assert.ok(!fs.existsSync(path.join(aliceDir, 'to-delete.txt')));

    const rootDelete = await request(app).post('/api/files/delete').set(aliceHeaders).send({ path: '' });
    assert.equal(rootDelete.status, 400);
  });

  test('users cannot recursively delete non-empty folders; admins can', async () => {
    await fsp.mkdir(path.join(aliceDir, 'nonempty'), { recursive: true });
    await fsp.writeFile(path.join(aliceDir, 'nonempty', 'inner.txt'), 'x');

    const denied = await request(app).post('/api/files/delete').set(aliceHeaders).send({ path: 'nonempty' });
    assert.equal(denied.status, 409);
    assert.equal(denied.body.error.code, 'folder_not_empty');

    const allowed = await request(app).post('/api/files/delete').set(adminHeaders).send({ path: 'alice/nonempty' });
    assert.equal(allowed.status, 200);
    assert.ok(!fs.existsSync(path.join(aliceDir, 'nonempty')));
  });

  test('cannot reach another user via parent traversal', async () => {
    const denied = await request(app).post('/api/files/delete').set(aliceHeaders).send({ path: '../bob/bob.txt' });
    assert.equal(denied.status, 400);
    assert.ok(fs.existsSync(path.join(bobDir, 'bob.txt')));
  });

  test('rejects invalid names', async () => {
    for (const name of ['', '.', '..', 'a/b', '.dotfile', 'bad\\name']) {
      const res = await request(app).post('/api/files/folder').set(aliceHeaders).send({ path: '', name });
      assert.equal(res.status, 400, `expected 400 for name=${JSON.stringify(name)}`);
    }
  });
});

describe('admin', () => {
  test('non-admins cannot list users', async () => {
    const res = await request(app).get('/api/admin/users').set(aliceHeaders);
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'forbidden');
  });

  test('admin user listing includes quota info and entry counts', async () => {
    const res = await request(app).get('/api/admin/users').set(adminHeaders);
    assert.equal(res.status, 200);
    const byName = new Map(res.body.users.map((item) => [item.user, item]));
    assert.ok(byName.has('alice'));
    assert.ok(byName.has('bob'));
    assert.ok(!res.body.users.some((item) => item.user.startsWith('.'))); // .tmp staging hidden

    const alice = byName.get('alice');
    assert.equal(alice.root, aliceDir);
    assert.equal(typeof alice.usedBytes, 'number');
    assert.ok(alice.usedBytes >= 11);
    assert.equal(typeof alice.limitBytes, 'number');
    assert.ok(alice.limitBytes > 0);
    assert.equal(typeof alice.entries, 'number');
    assert.ok(alice.entries >= 3);

    const bob = byName.get('bob');
    assert.equal(bob.usedBytes, 8);
    assert.equal(bob.entries, 1);
  });

  test('admin scoping via ?user= works for file listing', async () => {
    const res = await request(app).get('/api/files').query({ user: 'bob' }).set(adminHeaders);
    assert.equal(res.status, 200);
    assert.ok(res.body.entries.some((entry) => entry.name === 'bob.txt'));

    const bad = await request(app).get('/api/files').query({ user: '../etc' }).set(adminHeaders);
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'invalid_user');

    const missing = await request(app).get('/api/files').query({ user: 'ghost' }).set(adminHeaders);
    assert.equal(missing.status, 404);
  });
});

describe('usage', () => {
  test('buckets bytes by mtime for the requested window', async () => {
    const res = await request(app).get('/api/usage').query({ days: 7 }).set(aliceHeaders);
    assert.equal(res.status, 200);
    assert.ok(res.body.totalBytes >= 11);
    assert.equal(res.body.byDay.length, 7);
    const dates = res.body.byDay.map((day) => day.date);
    assert.deepEqual(dates, [...dates].sort());
    for (const day of res.body.byDay) {
      assert.match(day.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(typeof day.bytes, 'number');
    }
    const windowSum = res.body.byDay.reduce((sum, day) => sum + day.bytes, 0);
    assert.ok(windowSum >= 11);
    assert.ok(res.body.totalBytes >= windowSum);
  });

  test('days=1 returns today only; invalid days are rejected', async () => {
    const one = await request(app).get('/api/usage').query({ days: 1 }).set(aliceHeaders);
    assert.equal(one.status, 200);
    assert.equal(one.body.byDay.length, 1);

    const bad = await request(app).get('/api/usage').query({ days: 999 }).set(aliceHeaders);
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'invalid_days');
  });

  test('admin can scope usage to another user; users cannot', async () => {
    const asAdmin = await request(app).get('/api/usage').query({ user: 'bob' }).set(adminHeaders);
    assert.equal(asAdmin.status, 200);
    assert.equal(asAdmin.body.totalBytes, 8);

    const asAlice = await request(app).get('/api/usage').query({ user: 'bob' }).set(aliceHeaders);
    assert.equal(asAlice.status, 200);
    assert.ok(asAlice.body.totalBytes >= 11); // still alice's own scope
  });
});

describe('static files + SPA fallback', () => {
  test('missing static dir yields JSON 404 for pages and API', async () => {
    const page = await request(staticApp).get('/');
    assert.equal(page.status, 404);
    assert.equal(page.body.error.code, 'not_found');

    const api = await request(staticApp).get('/api/nope').set(aliceHeaders);
    assert.equal(api.status, 404);
    assert.equal(api.body.error.code, 'not_found');
  });

  test('serves static assets and falls back to index.html for SPA routes', async () => {
    const distDir = path.join(tmpRoot, 'dist');
    await fsp.mkdir(path.join(distDir, 'assets'), { recursive: true });
    await fsp.writeFile(path.join(distDir, 'index.html'), '<!doctype html><title>nas</title>');
    await fsp.writeFile(path.join(distDir, 'assets', 'app.js'), 'console.log(1);');
    const appWithDist = createApp({ staticDir: distDir });

    const root = await request(appWithDist).get('/');
    assert.equal(root.status, 200);
    assert.match(root.text, /<title>nas<\/title>/);

    const deep = await request(appWithDist).get('/files/some/deep/route');
    assert.equal(deep.status, 200);
    assert.match(deep.text, /<title>nas<\/title>/);

    const asset = await request(appWithDist).get('/assets/app.js');
    assert.equal(asset.status, 200);

    const api404 = await request(appWithDist).get('/api/nope');
    assert.equal(api404.status, 401); // auth runs before the API 404
  });
});
