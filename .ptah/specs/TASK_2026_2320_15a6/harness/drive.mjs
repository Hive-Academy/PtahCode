/**
 * Driver for the ISOLATED live-test Ptah instance (TASK_2026_2299_d6f5).
 *
 * Launches dist/apps/ptah-electron/main.mjs through Playwright's `_electron`
 * with a CLEAN environment whose HOME / XDG / PTAH paths all sit under
 * .ptah/tmp/live-test-home, then serves a small control API on 127.0.0.1:
 *
 *   POST /rpc   {"method":"chat:start","params":{...},"timeoutMs":20000}
 *               -> the app's rpc:response envelope
 *   GET  /health
 *   POST /stop  -> closes the app and exits
 *
 * Every `to-renderer` message the main process sends is appended to
 * events.jsonl (one JSON object per line, with `t` = epoch ms).
 *
 * Usage: node drive.mjs [--control-port=51991]
 */
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// rerun copy lives in <worktree>/.ptah/tmp/bench/live-test (4 levels down)
const WORKTREE = path.resolve(HERE, '..', '..', '..', '..');
const TH = path.join(WORKTREE, '.ptah', 'tmp', 'live-test-home');
const WS = path.join(WORKTREE, '.ptah', 'tmp', 'nav-live-ws');
const ENTRY = path.join(WORKTREE, 'dist', 'apps', 'ptah-electron', 'main.mjs');
const EVENTS = path.join(HERE, 'events.jsonl');
const portArg = process.argv.find((a) => a.startsWith('--control-port='));
const CONTROL_PORT = portArg ? Number(portArg.split('=')[1]) : 51991;

// Whitelist only: nothing of the hosting session (ANTHROPIC_*, CLAUDE_*,
// ELECTRON_*, DBUS, real XDG dirs) may reach the test instance.
const env = {
  PATH: process.env.PATH,
  LANG: process.env.LANG ?? 'C.UTF-8',
  DISPLAY: process.env.DISPLAY ?? ':0',
  ...(process.env.XAUTHORITY ? { XAUTHORITY: process.env.XAUTHORITY } : {}),
  SHELL: '/bin/bash',
  USER: process.env.USER ?? 'user',
  LOGNAME: process.env.LOGNAME ?? process.env.USER ?? 'user',
  TERM: 'dumb',
  HOME: TH,
  USERPROFILE: TH,
  XDG_CONFIG_HOME: path.join(TH, '.config'),
  XDG_CACHE_HOME: path.join(TH, '.cache'),
  XDG_DATA_HOME: path.join(TH, '.local', 'share'),
  XDG_STATE_HOME: path.join(TH, '.local', 'state'),
  XDG_RUNTIME_DIR: '/tmp/ptah-lt/run',
  TMPDIR: '/tmp/ptah-lt/tmp',
  PTAH_SETTINGS_DIR: path.join(TH, '.ptah-dev'),
  PTAH_DB_PATH: path.join(TH, 'state', 'ptah-dev.sqlite'),
  PTAH_SESSIONS_DB_PATH: path.join(TH, 'state', 'sessions-dev.sqlite'),
  NODE_ENV: 'development',
};

const INSTALL_PROBE = ({ BrowserWindow }) => {
  const probe = { msgs: [], waiters: new Map() };
  globalThis.__lt = probe;
  const patch = (contents) => {
    const proto = Object.getPrototypeOf(contents);
    if (proto.__ltPatched) return;
    proto.__ltPatched = true;
    const original = proto.send;
    proto.send = function patched(channel, payload, ...rest) {
      if (channel === 'to-renderer') {
        try {
          probe.msgs.push(JSON.stringify({ t: Date.now(), m: payload }));
          const id = payload && payload.correlationId;
          if (id && probe.waiters.has(id)) {
            probe.waiters.get(id)(payload);
            probe.waiters.delete(id);
          }
        } catch {
          probe.msgs.push(JSON.stringify({ t: Date.now(), unserialisable: true }));
        }
      }
      return original.call(this, channel, payload, ...rest);
    };
  };
  const timer = setInterval(() => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      patch(win.webContents);
      clearInterval(timer);
    }
  }, 25);
  return true;
};

async function main() {
  if (!fs.existsSync(ENTRY)) throw new Error(`no build at ${ENTRY}`);
  fs.mkdirSync(path.join(TH, 'state'), { recursive: true });
  const app = await _electron.launch({
    args: [ENTRY, '--password-store=basic', WS],
    env,
    cwd: WS,
    timeout: 60_000,
  });
  const appLog = fs.createWriteStream(path.join(HERE, 'app-stdout.log'), { flags: 'a' });
  app.process().stdout?.on('data', (c) => appLog.write(c));
  app.process().stderr?.on('data', (c) => appLog.write(c));
  await app.evaluate(INSTALL_PROBE);
  console.log(`[drive] app pid ${app.process().pid}`);

  const win = await app.firstWindow({ timeout: 60_000 });
  await win
    .waitForURL((u) => u.protocol === 'file:' && u.pathname.endsWith('/renderer/index.html'), {
      timeout: 60_000,
    })
    .catch((e) => console.log(`[drive] renderer url wait: ${e.message}`));
  console.log(`[drive] window url ${win.url()}`);

  const drain = setInterval(async () => {
    try {
      const lines = await app.evaluate(() => globalThis.__lt.msgs.splice(0));
      if (lines.length) fs.appendFileSync(EVENTS, lines.join('\n') + '\n');
    } catch {
      /* app gone */
    }
  }, 500);

  const rpc = (method, params, timeoutMs) =>
    app.evaluate(
      ({ ipcMain, BrowserWindow }, a) => {
        const w = BrowserWindow.getAllWindows()[0];
        if (!w) throw new Error('no window');
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            globalThis.__lt.waiters.delete(a.id);
            reject(new Error(`rpc ${a.method} timed out after ${a.timeoutMs}ms`));
          }, a.timeoutMs);
          globalThis.__lt.waiters.set(a.id, (msg) => {
            clearTimeout(timer);
            resolve(msg);
          });
          ipcMain.emit(
            'rpc',
            { sender: w.webContents, senderFrame: w.webContents.mainFrame },
            { type: 'rpc:call', payload: { method: a.method, params: a.params, correlationId: a.id } },
          );
        });
      },
      { method, params, timeoutMs, id: `lt-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    );

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      const send = (code, obj) => {
        res.writeHead(code, { 'content-type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      try {
        if (req.url === '/health') return send(200, { ok: true, pid: app.process().pid });
        if (req.url === '/stop') {
          send(200, { ok: true });
          clearInterval(drain);
          await app.close().catch(() => undefined);
          process.exit(0);
        }
        if (req.url === '/rpc') {
          const { method, params, timeoutMs } = JSON.parse(body);
          return send(200, await rpc(method, params ?? {}, timeoutMs ?? 20_000));
        }
        send(404, { error: 'unknown' });
      } catch (e) {
        send(500, { error: String(e && e.message ? e.message : e) });
      }
    });
  });
  server.listen(CONTROL_PORT, '127.0.0.1', () =>
    console.log(`[drive] control on http://127.0.0.1:${CONTROL_PORT}`),
  );
  app.process().on('exit', (code) => {
    console.log(`[drive] app exited ${code}`);
    process.exit(0);
  });
}

main().catch((e) => {
  console.error(`[drive] FAILED ${e && e.stack ? e.stack : e}`);
  process.exit(1);
});
