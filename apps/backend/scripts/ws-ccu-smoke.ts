/**
 * WebSocket CCU smoke: opens many authenticated Socket.io connections against the API.
 *
 * Env:
 *   SOCKET_LOADTEST_URL          default http://localhost:3010
 *   SOCKET_LOADTEST_TOKEN        required — backend access JWT (`auth.token` handshake)
 *   SOCKET_LOADTEST_CCU          default 100 (connection target)
 *   SOCKET_LOADTEST_CONCURRENCY  default 25 (parallel handshake batch)
 *   SOCKET_LOADTEST_HOLD_MS      default 5000 — keep sockets open this long, then disconnect
 *
 * Example (from apps/backend, API running on 3010):
 *   SOCKET_LOADTEST_TOKEN="<access_jwt>" SOCKET_LOADTEST_CCU=1000 npm run loadtest:ws
 */
import { io, Socket } from 'socket.io-client';

const url = process.env.SOCKET_LOADTEST_URL ?? 'http://localhost:3010';
const token = process.env.SOCKET_LOADTEST_TOKEN;
const target = Math.min(10_000, Math.max(1, parseInt(process.env.SOCKET_LOADTEST_CCU ?? '100', 10)));
const concurrency = Math.max(1, parseInt(process.env.SOCKET_LOADTEST_CONCURRENCY ?? '25', 10));
const holdMs = Math.max(0, parseInt(process.env.SOCKET_LOADTEST_HOLD_MS ?? '5000', 10));

if (!token) {
  console.error('SOCKET_LOADTEST_TOKEN is required (backend access JWT)');
  process.exit(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function openSocket(id: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(url, {
      path: '/socket.io/',
      transports: ['websocket'],
      auth: { token },
      reconnection: false,
      timeout: 20_000,
    });
    s.once('connect', () => resolve(s));
    s.once('connect_error', (e) => reject(new Error(`#${id}: ${e.message}`)));
  });
}

async function main() {
  console.log(`Connecting ${target} sockets to ${url} (concurrency ${concurrency})…`);
  const sockets: Socket[] = [];
  let connectFailures = 0;
  const start = Date.now();
  for (let i = 0; i < target; i += concurrency) {
    const batch: Promise<Socket>[] = [];
    for (let j = 0; j < concurrency && i + j < target; j++) {
      batch.push(openSocket(i + j));
    }
    const settled = await Promise.allSettled(batch);
    for (const r of settled) {
      if (r.status === 'fulfilled') sockets.push(r.value);
      else {
        console.error(r.reason);
        connectFailures++;
      }
    }
    process.stdout.write(`\rconnected=${sockets.length} connect_failures=${connectFailures}`);
  }
  const connectMs = Date.now() - start;
  console.log(`\nConnected ${sockets.length}/${target} in ${connectMs}ms`);
  if (holdMs > 0 && sockets.length > 0) {
    console.log(`Holding ${sockets.length} connections for ${holdMs}ms…`);
    await sleep(holdMs);
  }
  for (const s of sockets) {
    s.disconnect();
  }
  console.log('Disconnected.');
  process.exit(connectFailures > 0 || sockets.length < target ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
