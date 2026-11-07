import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import mime from 'mime-types';
import multer from 'multer';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { listDirectory, lstatOrNull } from '../lib/fsutil.js';
import { assertRealPathInside, joinRel, parseRelPath, resolveInRoot, validateName } from '../lib/paths.js';
import { getUserQuota } from '../lib/quota.js';
import { resolveScope } from '../lib/scope.js';

const MAX_FILES_PER_UPLOAD = 20;

/**
 * Multer/busboy historically delivers multipart filenames as latin1. If the
 * name looks like mojibake (chars in U+0080..U+00FF), try to re-decode it as
 * UTF-8; keep the original when the re-decode is invalid.
 */
function decodeUploadName(name) {
  const value = String(name ?? '');
  if (!/[\u0080-\u00ff]/u.test(value)) return value;
  const decoded = Buffer.from(value, 'latin1').toString('utf8');
  return decoded.includes('\ufffd') ? value : decoded;
}

function baseName(rawName) {
  const normalized = String(rawName ?? '').replace(/\\/gu, '/');
  return path.posix.basename(normalized);
}

function contentDisposition(filename) {
  const fallback = filename.replace(/[^\u0020-\u007e]/gu, '_').replace(/["\\]/gu, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Parses a single-range "bytes=" header; returns null when unsatisfiable. */
function parseRangeHeader(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/u.exec(String(header ?? '').trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return null;
  let start;
  let end;
  if (rawStart === '') {
    const suffix = Number.parseInt(rawEnd, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number.parseInt(rawStart, 10);
    end = rawEnd === '' ? size - 1 : Math.min(Number.parseInt(rawEnd, 10), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { start, end };
}

/** rename() with a copy+rename fallback across filesystems (EXDEV). */
async function moveFile(src, dest) {
  try {
    await fsp.rename(src, dest);
    return;
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
  }
  const tempDest = path.join(path.dirname(dest), `.upload-${crypto.randomUUID()}.part`);
  try {
    await fsp.copyFile(src, tempDest);
    await fsp.rename(tempDest, dest);
    await fsp.unlink(src).catch(() => {});
  } catch (err) {
    await fsp.unlink(tempDest).catch(() => {});
    throw err;
  }
}

function streamFileToResponse(absPath, range, req, res) {
  const stream = fs.createReadStream(absPath, range ? { start: range.start, end: range.end } : undefined);
  stream.on('error', () => {
    res.destroy();
  });
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

export function createFilesRouter(config) {
  const router = express.Router();
  const stagingDir = path.join(config.dataDir, '.tmp');
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        fsp.mkdir(stagingDir, { recursive: true }).then(
          () => cb(null, stagingDir),
          (err) => cb(err)
        );
      },
      filename: (req, file, cb) => cb(null, crypto.randomUUID())
    }),
    limits: {
      fileSize: config.maxUploadMb * 1024 * 1024,
      files: MAX_FILES_PER_UPLOAD
    }
  });

  // GET /api/files?path=<relative>&user=<admin-only>
  router.get('/', asyncHandler(async (req, res) => {
    const scope = await resolveScope(req, config, { ensureRoot: true });
    const relPath = parseRelPath(req.query.path);
    const absPath = resolveInRoot(scope.root, relPath);
    await assertRealPathInside(absPath, scope.root);
    const stat = await lstatOrNull(absPath);
    if (!stat) throw new ApiError(404, 'not_found', 'Folder not found');
    if (!stat.isDirectory()) throw new ApiError(400, 'not_a_directory', 'Path is not a folder');
    const entries = await listDirectory(absPath);
    res.json({ path: relPath, entries });
  }));

  // GET /api/files/content?path=<relative>&user=<admin-only> — streams a file,
  // supports single HTTP Range requests.
  router.get('/content', asyncHandler(async (req, res) => {
    const scope = await resolveScope(req, config);
    const relPath = parseRelPath(req.query.path);
    if (relPath === '') throw new ApiError(400, 'invalid_path', 'A file path is required');
    const absPath = resolveInRoot(scope.root, relPath);
    const stat = await lstatOrNull(absPath);
    if (!stat) throw new ApiError(404, 'not_found', 'File not found');
    if (stat.isSymbolicLink()) throw new ApiError(403, 'forbidden', 'Symbolic links are not served');
    if (!stat.isFile()) throw new ApiError(400, 'not_a_file', 'Path is not a file');
    await assertRealPathInside(absPath, scope.root);

    const size = stat.size;
    const rangeHeader = req.headers.range;
    const range = rangeHeader === undefined ? null : parseRangeHeader(rangeHeader, size);
    if (rangeHeader !== undefined && range === null) {
      res.setHeader('Content-Range', `bytes */${size}`);
      throw new ApiError(416, 'range_not_satisfiable', 'Requested range not satisfiable');
    }

    res.setHeader('Content-Type', mime.lookup(absPath) || 'application/octet-stream');
    res.setHeader('Content-Disposition', contentDisposition(path.basename(absPath)));
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Last-Modified', stat.mtime.toUTCString());
    if (range) {
      res.status(206);
      res.setHeader('Content-Length', String(range.end - range.start + 1));
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    } else {
      res.status(200);
      res.setHeader('Content-Length', String(size));
    }
    if (req.method === 'HEAD' || size === 0) {
      res.end();
      return;
    }
    streamFileToResponse(absPath, range, req, res);
  }));

  // POST /api/files/upload?path=<relative> — multipart field "files" (1-20).
  router.post('/upload', upload.array('files', MAX_FILES_PER_UPLOAD), asyncHandler(async (req, res) => {
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      throw new ApiError(400, 'no_files', 'No files uploaded (multipart field name must be "files")');
    }
    try {
      const scope = await resolveScope(req, config, { ensureRoot: true });
      const relDir = parseRelPath(req.query.path);
      const dirAbs = resolveInRoot(scope.root, relDir);
      await assertRealPathInside(dirAbs, scope.root);
      const dirStat = await lstatOrNull(dirAbs);
      if (!dirStat || !dirStat.isDirectory()) {
        throw new ApiError(404, 'not_found', 'Upload folder not found');
      }

      const errors = [];
      const pending = [];
      for (const file of files) {
        const originalName = decodeUploadName(file.originalname);
        const name = baseName(originalName);
        try {
          validateName(name);
        } catch (err) {
          errors.push({ name: originalName || file.originalname, error: err.message });
          continue;
        }
        pending.push({ stagedPath: file.path, name, size: file.size });
      }

      const enforceQuota = scope.role !== 'admin' || config.enforceQuotaAdmins;
      const incomingBytes = pending.reduce((sum, item) => sum + item.size, 0);
      if (enforceQuota && pending.length > 0) {
        const quota = await getUserQuota({
          username: scope.user,
          rootDir: scope.root,
          limitBytes: config.quotaLimitBytes
        });
        if (quota.usedBytes + incomingBytes > quota.limitBytes) {
          for (const item of pending) errors.push({ name: item.name, error: 'Quota exceeded' });
          return res.status(413).json({
            uploaded: [],
            errors,
            error: {
              code: 'quota_exceeded',
              message: `Quota exceeded: ${quota.usedBytes} bytes used + ${incomingBytes} bytes incoming > ${quota.limitBytes} bytes limit`
            }
          });
        }
      }

      const uploaded = [];
      for (const item of pending) {
        const targetAbs = resolveInRoot(dirAbs, item.name);
        const existing = await lstatOrNull(targetAbs);
        if (existing) {
          errors.push({ name: item.name, error: 'A file or folder with this name already exists' });
          continue;
        }
        try {
          await moveFile(item.stagedPath, targetAbs);
          uploaded.push({ name: item.name, size: item.size });
        } catch {
          errors.push({ name: item.name, error: 'Failed to store file' });
        }
      }

      const body = { uploaded, errors };
      if (uploaded.length === 0) {
        body.error = {
          code: 'upload_failed',
          message: errors.length > 0 ? 'No files were uploaded (see errors)' : 'No valid files to upload'
        };
        return res.status(400).json(body);
      }
      return res.status(errors.length > 0 ? 207 : 200).json(body);
    } finally {
      await Promise.all(files.map((file) => fsp.unlink(file.path).catch(() => {})));
    }
  }));

  // POST /api/files/folder { path, name }
  router.post('/folder', asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const relDir = parseRelPath(body.path);
    const name = validateName(body.name);
    const scope = await resolveScope(req, config, { ensureRoot: true });
    const parentAbs = resolveInRoot(scope.root, relDir);
    await assertRealPathInside(parentAbs, scope.root);
    const parentStat = await lstatOrNull(parentAbs);
    if (!parentStat || !parentStat.isDirectory()) {
      throw new ApiError(404, 'not_found', 'Parent folder not found');
    }
    const targetAbs = resolveInRoot(parentAbs, name);
    if (await lstatOrNull(targetAbs)) {
      throw new ApiError(409, 'already_exists', 'A file or folder with that name already exists');
    }
    await fsp.mkdir(targetAbs);
    res.json({ ok: true, path: joinRel(relDir, name) });
  }));

  // POST /api/files/rename { path, name } — rename within the same parent.
  router.post('/rename', asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const relPath = parseRelPath(body.path);
    if (relPath === '') throw new ApiError(400, 'invalid_path', 'path is required');
    const name = validateName(body.name);
    const scope = await resolveScope(req, config);
    const absPath = resolveInRoot(scope.root, relPath);
    const stat = await lstatOrNull(absPath);
    if (!stat) throw new ApiError(404, 'not_found', 'Path not found');
    const parentAbs = path.dirname(absPath);
    await assertRealPathInside(parentAbs, scope.root);
    const targetAbs = resolveInRoot(parentAbs, name);
    if (targetAbs === absPath) {
      return res.json({ ok: true, path: relPath });
    }
    if (await lstatOrNull(targetAbs)) {
      throw new ApiError(409, 'already_exists', 'A file or folder with that name already exists');
    }
    await fsp.rename(absPath, targetAbs);
    const parentRel = path.posix.dirname(relPath);
    return res.json({ ok: true, path: joinRel(parentRel === '.' ? '' : parentRel, name) });
  }));

  // POST /api/files/delete { path } — recursive only for admins; users may
  // delete files and empty folders.
  router.post('/delete', asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const relPath = parseRelPath(body.path);
    if (relPath === '') throw new ApiError(400, 'invalid_path', 'The root folder cannot be deleted');
    const scope = await resolveScope(req, config);
    const absPath = resolveInRoot(scope.root, relPath);
    const stat = await lstatOrNull(absPath);
    if (!stat) throw new ApiError(404, 'not_found', 'Path not found');
    await assertRealPathInside(path.dirname(absPath), scope.root);

    if (stat.isSymbolicLink()) {
      await fsp.unlink(absPath);
    } else if (stat.isDirectory()) {
      await assertRealPathInside(absPath, scope.root);
      if (req.user.role === 'admin') {
        await fsp.rm(absPath, { recursive: true });
      } else {
        try {
          await fsp.rmdir(absPath);
        } catch (err) {
          if (err.code === 'ENOTEMPTY' || err.code === 'EEXIST') {
            throw new ApiError(409, 'folder_not_empty', 'Folder is not empty (recursive delete requires admin)');
          }
          throw err;
        }
      }
    } else {
      await assertRealPathInside(absPath, scope.root);
      await fsp.unlink(absPath);
    }
    res.json({ ok: true });
  }));

  return router;
}
