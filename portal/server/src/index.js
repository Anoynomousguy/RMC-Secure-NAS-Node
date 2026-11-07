import { createApp } from './app.js';
import { loadEnvConfig } from './config.js';

const config = loadEnvConfig();
const app = createApp();

const server = app.listen(config.port, config.host, () => {
  console.log(`[nas-portal] listening on http://${config.host}:${config.port} (data dir: ${config.dataDir})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`[nas-portal] received ${signal}, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
