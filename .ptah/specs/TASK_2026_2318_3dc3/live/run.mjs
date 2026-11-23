// Isolated live test: real Electron app (isolated HOME), real MCP HTTP tool path.
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, openSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const wt = process.cwd();
const base = '/tmp/ptah-live-ast';
const home = `${base}/home`;
const ws = `${base}/ws`;
rmSync(base, { recursive: true, force: true });
for (const d of [home, ws, `${base}/udd`, `${base}/settings`, `${home}/.config`, `${home}/.local/share`, `${home}/.cache`, `${ws}/src`]) {
  mkdirSync(d, { recursive: true });
}
execSync('git init -q', { cwd: ws });

// Fixture: 12 outer classes, each with a nested class (150 methods) that holds
// a third-level class; plus a compact class and a top-level class.
const outers = [];
for (let i = 0; i < 12; i++) {
  const methods = Array.from({ length: 150 }, (_, k) => `    m${k}(a: string): string {\n      return a + '${k}';\n    }`).join('\n');
  outers.push(`class Outer${i} {
  make() {
    const Inner = class {
${methods}
      deepen() {
        const Deep = class {
          go() {
            return ${i};
          }
        };
        return Deep;
      }
    };
    return Inner;
  }
}
`);
}
outers.push('class Plain {\n  load() {\n    return 1;\n  }\n}\n');
outers.push('class OneLine { hit() { return 2; } }\n');
writeFileSync(`${ws}/src/nested.ts`, outers.join('\n'));

const require = createRequire(`${wt}/package.json`);
const electron = require('electron');
const env = {
  ...process.env,
  HOME: home, USERPROFILE: home,
  XDG_CONFIG_HOME: `${home}/.config`, XDG_DATA_HOME: `${home}/.local/share`, XDG_CACHE_HOME: `${home}/.cache`,
  PTAH_SETTINGS_DIR: `${base}/settings`, PTAH_DB_PATH: `${base}/ptah-live.sqlite`,
  NODE_ENV: 'development',
};
delete env.ELECTRON_RUN_AS_NODE;
const logPath = `${base}/app.log`;
const fd = openSync(logPath, 'w');
const child = spawn(electron, [path.join(wt, 'dist/apps/ptah-electron/main.mjs'), `--user-data-dir=${base}/udd`, ws], {
  env, stdio: ['ignore', fd, fd], detached: true,
});
console.log('app pid', child.pid);
const stop = () => {
  for (const sig of ['SIGTERM', 'SIGKILL']) {
    try { process.kill(-child.pid, sig); } catch {}
    try { execSync('sleep 3'); } catch {}
  }
};
process.on('exit', stop);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let port;
for (let i = 0; i < 120 && !port; i++) {
  await sleep(1000);
  const m = /MCP server started on port (\d+)/.exec(readFileSync(logPath, 'utf8'));
  if (m) port = Number(m[1]);
}
if (!port) { console.log('NO PORT; log tail:\n' + readFileSync(logPath, 'utf8').slice(-1500)); stop(); process.exit(1); }
console.log('test instance MCP port', port);
if (port === 51820) { console.log('ABORT: port 51820 is the real app'); stop(); process.exit(2); }
await sleep(3000);

let base_url;
for (let attempt = 0; attempt < 40 && !base_url; attempt++) {
  if (attempt > 0) await sleep(1000);
  for (const f of [`${ws}/.mcp.json`, `${home}/.codex/config.toml`]) {
  if (!existsSync(f)) continue;
  const m = /(http:\/\/localhost:\d+\/auth\/[A-Za-z0-9_-]{43}\/workspace\/[^"'\s]+)/.exec(readFileSync(f, 'utf8'));
  if (m) { base_url = m[1]; console.log('url form from', f, 'after', attempt, 's'); break; }
  }
}
if (!base_url) { console.log('NO TOKEN URL'); stop(); process.exit(3); }
const call = async (name, args, id) => {
  const res = await fetch(base_url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }),
  });
  const body = await res.json();
  return body.result?.content?.map((c) => c.text).join('\n') ?? JSON.stringify(body);
};

const file = `${ws}/src/nested.ts`;
const analyzed = await call('ptah_ast_analyze', { file, workspaceRoot: ws }, 1);
writeFileSync(`${base}/live-ast.json`, analyzed);
const parsed = JSON.parse(analyzed);
const note = parsed.truncated?.classes;
console.log('truncated.classes (without names):', JSON.stringify({ ...note, omittedNames: undefined }));
console.log('hint:', parsed.hint);
const names = (note?.omittedNames ?? '').split(',');
console.log('omittedNames count', names.length, 'first 6:', names.slice(0, 6).join(' | '));
const results = [];
const pick = [
  ...names.filter((n) => /^Outer\d+\.Inner$/.test(n)).slice(0, 2),
  ...names.filter((n) => /^Outer\d+\.Inner\.Deep$/.test(n)).slice(0, 1),
  ...names.filter((n) => /^Outer\d+\.Inner\.m\d+$/.test(n)).slice(0, 2),
  ...names.filter((n) => /^Outer\d+\.Inner\.Deep\.go$/.test(n)).slice(0, 1),
  ...names.filter((n) => /^Plain/.test(n) || n === 'hit'),
];
console.log('names read back:', pick.join(', '));
let n = 10;
for (const name of pick) {
  const text = await call('ptah_read_symbol', { file, name, workspaceRoot: ws, maxLines: 6 }, n++);
  results.push({ name, head: text.split('\n')[0] });
  console.log(`read ${name} ->`, text.split('\n')[0]);
}
// The old, immediate-owner-only form must still be refused.
const bad = await call('ptah_read_symbol', { file, name: 'Inner.run', workspaceRoot: ws }, n++);
console.log('read Inner.run (old form) ->', bad.split('\n')[0]);
writeFileSync(`${base}/live-reads.json`, JSON.stringify(results, null, 1));
stop();
await sleep(2000);
process.exit(0);
