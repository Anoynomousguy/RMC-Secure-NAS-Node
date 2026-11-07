import { sendError } from '../lib/errors.js';
import { isValidUserName } from '../lib/paths.js';

function headerValue(value) {
  if (Array.isArray(value)) return value.join(',');
  return typeof value === 'string' ? value : '';
}

/**
 * Identity comes from Authelia forward-auth headers injected by the reverse
 * proxy (Remote-User / Remote-Groups / Remote-Name / Remote-Email), or from
 * DEV_USER / DEV_ROLE when TRUST_PROXY_AUTH=false.
 *
 * Role rule: membership in the "admins" group (case-insensitive, groups may
 * be space- or comma-separated) grants role "admin", otherwise "user".
 */
export function createAuthMiddleware(config) {
  return function authenticate(req, res, next) {
    if (config.trustProxyAuth) {
      const username = (headerValue(req.headers['remote-user']).trim().split(',')[0] ?? '').trim();
      if (!username) {
        return sendError(res, 401, 'unauthorized', 'Authentication required (missing Remote-User header)');
      }
      if (!isValidUserName(username)) {
        return sendError(res, 401, 'unauthorized', 'Invalid user identity');
      }
      const groups = headerValue(req.headers['remote-groups'])
        .split(/[,\s]+/u)
        .map((group) => group.trim().toLowerCase())
        .filter(Boolean);
      req.user = {
        username,
        role: groups.includes('admins') ? 'admin' : 'user',
        name: headerValue(req.headers['remote-name']).trim() || null,
        email: headerValue(req.headers['remote-email']).trim() || null,
        groups
      };
    } else {
      req.user = {
        username: config.devUser,
        role: config.devRole,
        name: config.devUser,
        email: null,
        groups: config.devRole === 'admin' ? ['admins'] : []
      };
    }
    next();
  };
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return sendError(res, 403, 'forbidden', 'Admin access required');
  }
  next();
}
