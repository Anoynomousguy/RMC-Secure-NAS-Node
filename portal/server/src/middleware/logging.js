/**
 * One-line access log to stdout: method, path, status, duration, user.
 */
export function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const user = req.user?.username ?? '-';
    console.log(`[nas-portal] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms user=${user}`);
  });
  next();
}
