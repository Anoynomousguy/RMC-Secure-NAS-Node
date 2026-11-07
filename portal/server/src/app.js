import fs from 'node:fs';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import { loadEnvConfig } from './config.js';
import { asyncHandler, createErrorHandler, sendError } from './lib/errors.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { requestLogger } from './middleware/logging.js';
import { createAdminRouter } from './routes/admin.js';
import { createFilesRouter } from './routes/files.js';
import { createMeRouter } from './routes/me.js';
import { createUsageRouter } from './routes/usage.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/**
 * Builds the Express app. `options` overrides env-derived config (used by tests).
 * Kept separate from index.js so tests can run the app without listening.
 */
export function createApp(options = {}) {
  const config = { ...loadEnvConfig(), ...options };

  // Best-effort: make DATA_DIR available and clear abandoned upload staging.
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
  } catch {
    /* DATA_DIR may be provisioned elsewhere / not writable yet */
  }
  try {
    fs.rmSync(path.join(config.dataDir, '.tmp'), { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  const app = express();
  app.locals.config = config;
  app.disable('x-powered-by');

  // CSP is intentionally left to the reverse proxy (Caddy/Authelia) because
  // the SPA is served from here and its policy needs to match the deployment.
  app.use(helmet({ contentSecurityPolicy: false }));
  if (config.logRequests) app.use(requestLogger);

  // Health check: no auth, suitable for Uptime Kuma.
  app.get('/api/health', asyncHandler(async (req, res) => {
    res.json({ status: 'ok', version: pkg.version });
  }));

  // Everything else under /api requires identity.
  app.use('/api', createAuthMiddleware(config));
  app.use('/api', express.json({ limit: '1mb' }));
  app.use('/api/me', createMeRouter(config));
  app.use('/api/files', createFilesRouter(config));
  app.use('/api/admin', createAdminRouter(config));
  app.use('/api/usage', createUsageRouter(config));
  app.use('/api', (req, res) => sendError(res, 404, 'not_found', 'Not found'));

  // Static frontend (../web/dist relative to the server dir, STATIC_DIR override).
  const staticRoot = config.staticDir;
  const serveStatic = express.static(staticRoot, { index: 'index.html', fallthrough: true, dotfiles: 'ignore' });
  app.use((req, res, next) => {
    if (!fs.existsSync(staticRoot)) return next();
    return serveStatic(req, res, next);
  });

  // SPA fallback: only when the dist directory (and index.html) actually exist.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api')) return next();
    const indexPath = path.join(staticRoot, 'index.html');
    if (!fs.existsSync(indexPath)) return next();
    return res.sendFile(indexPath);
  });

  app.use((req, res) => sendError(res, 404, 'not_found', 'Not found'));
  app.use(createErrorHandler(config));

  return app;
}
