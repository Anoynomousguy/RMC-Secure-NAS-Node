// One-shot, idempotent Uptime Kuma 2.x initializer.
// Creates the admin user on first run, logs in, and adds HTTP monitors for
// the sibling containers. Safe to run again: existing monitor names are skipped.
const { io } = require('socket.io-client');

const URL = process.env.UPTIME_KUMA_URL || 'http://uptime-kuma:3001';
const USERNAME = process.env.UPTIME_KUMA_USERNAME || 'admin';
const PASSWORD = process.env.UPTIME_KUMA_PASSWORD;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const template = (name, url) => ({
  type: 'http',
  name,
  url,
  method: 'GET',
  interval: 60,
  retryInterval: 60,
  resendInterval: 0,
  maxretries: 3,
  retryOnlyOnStatusCodeFailure: false,
  maxredirects: 10,
  upsideDown: false,
  accepted_statuscodes: ['200-299'],
  ignoreTls: false,
  notificationIDList: {},
  expiryNotification: false,
  saveResponse: false,
  saveErrorResponse: true,
  responseMaxLength: 1024,
  conditions: [],
  parent: null,
});

const MONITORS = [
  template('Authelia', 'http://authelia:9091/api/health'),
  template('Dufs', 'http://dufs:5000/__dufs__/health'),
  template('Vaultwarden', 'http://vaultwarden:80/alive'),
  template('Portal', 'http://portal:3000/api/health'),
];

async function connectWithRetry() {
  for (let i = 1; ; i++) {
    try {
      return await new Promise((resolve, reject) => {
        const socket = io(URL, { transports: ['websocket'], reconnection: false, timeout: 10000 });
        socket.once('connect', () => resolve(socket));
        socket.once('connect_error', reject);
      });
    } catch (error) {
      console.log(`[kuma-init] Kuma not ready (attempt ${i}): ${error.message}; retrying in 3s`);
      await sleep(3000);
    }
  }
}

(async () => {
  if (!PASSWORD) throw new Error('UPTIME_KUMA_PASSWORD is not set');
  const socket = await connectWithRetry();
  const emitAck = (event, ...args) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ack for "${event}"`)), 30000);
      socket.emit(event, ...args, (response) => {
        clearTimeout(timer);
        resolve(response);
      });
    });

  if (await emitAck('needSetup')) {
    const result = await emitAck('setup', USERNAME, PASSWORD);
    if (!result || !result.ok) throw new Error(`setup failed: ${JSON.stringify(result)}`);
    console.log(`[kuma-init] initial admin "${USERNAME}" created`);
  }

  const listPromise = new Promise((resolve) => socket.once('monitorList', resolve));
  const login = await emitAck('login', { username: USERNAME, password: PASSWORD, token: '' });
  if (!login || !login.ok) throw new Error(`login failed: ${JSON.stringify(login)}`);

  const list = await Promise.race([listPromise, sleep(15000).then(() => ({}))]);
  const existing = new Set(Object.values(list).map((monitor) => monitor.name));
  console.log(`[kuma-init] logged in; ${existing.size} monitor(s) present`);

  for (const monitor of MONITORS) {
    if (existing.has(monitor.name)) {
      console.log(`[kuma-init] skip "${monitor.name}" (exists)`);
      continue;
    }
    const result = await emitAck('add', monitor);
    if (!result || !result.ok) throw new Error(`add "${monitor.name}" failed: ${result && result.msg}`);
    console.log(`[kuma-init] added "${monitor.name}" (id ${result.monitorID})`);
  }
  socket.disconnect();
  console.log('[kuma-init] done');
})().catch((error) => {
  console.error('[kuma-init] FAILED:', error);
  process.exit(1);
});
