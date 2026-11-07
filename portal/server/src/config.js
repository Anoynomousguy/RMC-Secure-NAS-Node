import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PROJECT_DIR = path.resolve(SERVER_DIR, '..');

function intFromEnv(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Reads configuration from the environment. Called every time an app is
 * created so tests can set env vars before importing/creating the app.
 */
export function loadEnvConfig(env = process.env) {
  return {
    // Auth
    trustProxyAuth: env.TRUST_PROXY_AUTH === 'true',
    devUser: env.DEV_USER || 'devuser',
    devRole: (env.DEV_ROLE || 'user').toLowerCase() === 'admin' ? 'admin' : 'user',

    // Filesystem scope
    dataDir: path.resolve(env.DATA_DIR || '/srv/fortress/data'),

    // Quotas
    quotaLimitBytes: intFromEnv(env.QUOTA_LIMIT_BYTES, 53687091200),
    enforceQuotaAdmins: env.ENFORCE_QUOTA_ADMINS === 'true',

    // Uploads
    maxUploadMb: intFromEnv(env.MAX_UPLOAD_MB, 512),

    // Static frontend
    staticDir: path.resolve(env.STATIC_DIR || path.join(PROJECT_DIR, 'web', 'dist')),

    // Server
    port: intFromEnv(env.PORT, 3000),
    host: env.HOST || '0.0.0.0',
    logRequests: env.LOG_REQUESTS !== 'false'
  };
}
