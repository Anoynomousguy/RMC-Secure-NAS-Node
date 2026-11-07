export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Consistent JSON error envelope: { error: { code, message } }
 */
export function sendError(res, status, code, message) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.status(status).json({ error: { code, message } });
}

export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function createErrorHandler(config) {
  return function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (err instanceof ApiError) {
      return sendError(res, err.status, err.code, err.message);
    }
    if (err && err.name === 'MulterError') {
      const table = {
        LIMIT_FILE_SIZE: [413, 'file_too_large', `Each file must be at most ${config.maxUploadMb} MB`],
        LIMIT_FILE_COUNT: [400, 'too_many_files', 'At most 20 files can be uploaded at once'],
        LIMIT_UNEXPECTED_FILE: [400, 'unexpected_file', 'Unexpected file field (use field name "files", max 20 files)'],
        LIMIT_PART_COUNT: [400, 'invalid_upload', 'Too many multipart parts'],
        LIMIT_FIELD_COUNT: [400, 'invalid_upload', 'Too many multipart fields'],
        LIMIT_FIELD_KEY: [400, 'invalid_upload', 'Multipart field name too long'],
        LIMIT_FIELD_VALUE: [400, 'invalid_upload', 'Multipart field value too long']
      };
      const [status, code, message] = table[err.code] || [400, 'invalid_upload', 'Invalid multipart upload'];
      return sendError(res, status, code, message);
    }
    if (err && err.type === 'entity.too.large') {
      return sendError(res, 413, 'payload_too_large', 'Request body too large (limit: 1mb)');
    }
    if (err && err.type === 'entity.parse.failed') {
      return sendError(res, 400, 'invalid_json', 'Request body is not valid JSON');
    }
    if (err && err.type === 'encoding.unsupported') {
      return sendError(res, 415, 'unsupported_encoding', 'Unsupported content encoding');
    }
    if (err && err.type === 'request.aborted') {
      return sendError(res, 400, 'request_aborted', 'Request aborted');
    }
    console.error('[nas-portal] unhandled error:', err);
    return sendError(res, 500, 'internal_error', 'Internal server error');
  };
}
