/**
 * Stage 2 of the live test (TASK_2026_2299_d6f5).
 * Arms: ptah-haiku, native-haiku, ptah-codex, native-codex. 8 tasks each.
 * Usage: node stage2.mjs <arm>[,<arm>] [taskIndexFrom] [taskIndexTo]
 * Needs drive.mjs running for the ptah arms. Appends to stage2-results.jsonl.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// rerun copy lives in <worktree>/.ptah/tmp/bench/live-test (4 levels down)
const WT = path.resolve(HERE, '..', '..', '..', '..');
const TH = path.join(WT, '.ptah', 'tmp', 'live-test-home');
const WS = path.join(WT, '.ptah', 'tmp', 'nav-live-ws');
const CODEX_NATIVE_HOME = '/tmp/ptah-lt/codex-native';
const RESULTS = path.join(HERE, process.env.BENCH_RESULTS || 'stage2-r7.jsonl');
// Code Mode arm: deny list in the workspace's local settings (loaded by the SDK
// through settingSources 'local'), present only while that arm runs.
const CODE_MODE_SETTINGS = path.join(WS, '.claude', 'settings.local.json');
// ptah-tool-names.json: every tool name of the live tools/list except execute_code
const codeModeDeny = () => [
  'Read', 'Grep', 'Glob', 'Bash', 'Task', 'Agent', 'WebFetch', 'WebSearch',
  ...JSON.parse(fs.readFileSync(path.join(HERE, 'ptah-tool-names.json'), 'utf8'))
    .filter((n) => n !== 'execute_code')
    .map((n) => `mcp__ptah__${n}`),
];
const CODE_MODE_PREFIX =
  'Use only the execute_code tool for code navigation: it runs JavaScript against the `ptah` global (call ptah.help() for the API). Do not call other tools. Question: ';
const CONTROL = 'http://127.0.0.1:51991';
const SUFFIX =
  ' Answer briefly. Name the full file paths and the exact identifiers.';
const KEYS = {
  'read-symbol-tab-manager-find-by-session': ['findTabBySessionId', 'claudeSessionId'],
  'read-range-permission-handler-levels': ['setPermissionLevel', 'getPendingCliAgentPermissions'],
  'usages-text-abort-reason-superseded': ['message-sender.service.ts', 'tab-manager.service.ts'],
  'concept-clamp-read-tail': ['clampTail'],
  'outline-indexing-control': ['getStatus', 'isRunning', 'dismissStale', 'acknowledgeDisclosure'],
  'usages-symbol-pending-permission-count': ['sdk-permission-handler.ts', 'permission.types.ts'],
  'files-session-handoff': ['session-handoff.service.ts', 'session-handoff-chain.store.ts'],
  'concept-release-attach-claim': ['releaseAttachClaim'],
};
const tasks = JSON.parse(fs.readFileSync(path.join(HERE, 'tasks.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanEnv = (extra = {}) => ({
  PATH: process.env.PATH,
  LANG: process.env.LANG ?? 'C.UTF-8',
  SHELL: '/bin/bash',
  USER: process.env.USER ?? 'user',
  LOGNAME: process.env.USER ?? 'user',
  TERM: 'dumb',
  HOME: TH,
  TMPDIR: '/tmp/ptah-lt/tmp',
  ...extra,
});

function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.jsonl')) out.push(p);
    }
  };
  walk(dir);
  return out;
}
const readJsonl = (f) =>
  fs
    .readFileSync(f, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

const SHELL_NAV = /\b(grep|rg|sed|cat|find|head|tail|ls|awk|wc|nl)\b/;
function classify(name, argText) {
  if (/execute_code/.test(name)) return 'code';
  if (name === 'ToolSearch') return 'discover';
  if (/ptah_/.test(name) || /ptah_/.test(argText.slice(0, 200))) return 'ptah';
  if (/^(Read|Grep|Glob)$/.test(name)) return 'native';
  if (/Bash|exec|shell/i.test(name)) return SHELL_NAV.test(argText) ? 'shell' : 'other';
  return 'other';
}

function parseClaude(file) {
  const L = readJsonl(file);
  const calls = [];
  let answer = '';
  let resultChars = 0;
  let errors = 0;
  const u = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let turns = 0;
  let model = '';
  const seen = new Set();
  for (const e of L) {
    const m = e.message;
    if (!m) continue;
    if (e.type === 'assistant') {
      // one API response can be split over several lines with the same id
      if (m.id && !seen.has(m.id)) {
        seen.add(m.id);
        turns++;
        model = m.model || model;
        const us = m.usage || {};
        u.input += us.input_tokens || 0;
        u.output += us.output_tokens || 0;
        u.cacheRead += us.cache_read_input_tokens || 0;
        u.cacheWrite += us.cache_creation_input_tokens || 0;
      }
      for (const c of m.content || []) {
        if (c.type === 'tool_use') {
          const a = JSON.stringify(c.input || {});
          calls.push({ name: c.name, cls: classify(c.name, a), arg: a.slice(0, 160) });
        }
        if (c.type === 'text' && c.text.trim()) answer = c.text;
      }
    }
    if (e.type === 'user' && Array.isArray(m.content)) {
      for (const c of m.content) {
        if (c.type === 'tool_result') {
          const t = typeof c.content === 'string' ? c.content : JSON.stringify(c.content);
          resultChars += t.length;
          if (c.is_error) errors++;
        }
      }
    }
  }
  return { calls, answer, resultChars, errors, usage: u, turns, model };
}

function parseCodex(file) {
  const L = readJsonl(file);
  const calls = [];
  let answer = '';
  let resultChars = 0;
  let tok = null;
  let model = '';
  let done = false;
  for (const e of L) {
    const p = e.payload || {};
    if (e.type === 'turn_context') model = p.model || model;
    if (/tool_call$|^function_call$|local_shell_call/.test(p.type || '')) {
      const a = String(p.arguments || p.input || JSON.stringify(p.action || ''));
      const inner = /tools\.([A-Za-z0-9_]+)\(/.exec(a);
      const name = inner ? inner[1] : p.name || p.type;
      const cls = /ALL_TOOLS/.test(a) ? 'discover' : classify(name, a);
      calls.push({ name, cls, arg: a.slice(0, 160) });
    }
    if (/call_output$/.test(p.type || '')) {
      const o = typeof p.output === 'string' ? p.output : JSON.stringify(p.output);
      resultChars += o.length;
    }
    if (p.type === 'message' && p.role === 'assistant') {
      const t = (p.content || []).map((c) => c.text || '').join('');
      if (t.trim()) answer = t;
    }
    if (p.type === 'token_count' && p.info) tok = p.info.total_token_usage;
    if (p.type === 'task_complete') done = true;
  }
  return { calls, answer, resultChars, tok, model, done };
}

async function rpc(method, params, timeoutMs = 60000) {
  const r = await fetch(`${CONTROL}/rpc`, {
    method: 'POST',
    body: JSON.stringify({ method, params, timeoutMs }),
  });
  return r.json();
}

function run(cmd, args, opts, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (out += c));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

async function waitFor(fn, timeoutMs, stepMs = 3000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(stepMs);
  }
  return null;
}

const claudeDir = path.join(TH, '.claude', 'projects');
const claudeDone = (f) => {
  const L = readJsonl(f);
  const last = [...L].reverse().find((e) => e.type === 'assistant' || e.type === 'user');
  if (!last || last.type !== 'assistant') return false;
  const stop = last.message?.stop_reason;
  const hasTool = (last.message?.content || []).some((c) => c.type === 'tool_use');
  return !hasTool && (stop === 'end_turn' || stop === 'stop_sequence') && Date.now() - fs.statSync(f).mtimeMs > 6000;
};

async function ptahHaiku(q) {
  const before = new Set(listFiles(claudeDir));
  const r = await rpc('chat:start', {
    tabId: crypto.randomUUID(),
    workspacePath: WS,
    prompt: q,
    options: { model: 'haiku' },
  });
  if (!r.success) return { error: `chat:start ${JSON.stringify(r).slice(0, 200)}` };
  const file = await waitFor(() => {
    const f = listFiles(claudeDir).find((x) => !before.has(x) && !x.includes('/subagents/'));
    return f && claudeDone(f) ? f : null;
  }, 300000);
  if (!file) return { error: 'timeout' };
  return { file, ...parseClaude(file) };
}

async function codeMode(q) {
  fs.mkdirSync(path.dirname(CODE_MODE_SETTINGS), { recursive: true });
  fs.writeFileSync(
    CODE_MODE_SETTINGS,
    JSON.stringify({ permissions: { deny: codeModeDeny() } }, null, 1),
  );
  try {
    return await ptahHaiku(CODE_MODE_PREFIX + q);
  } finally {
    fs.rmSync(CODE_MODE_SETTINGS, { force: true });
  }
}

async function nativeHaiku(q) {
  const before = new Set(listFiles(claudeDir));
  const r = await run(
    'claude',
    ['-p', q, '--model', 'haiku', '--max-turns', '30', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--allowedTools', 'Bash,Read,Grep,Glob', '--output-format', 'json'],
    { cwd: WS, env: cleanEnv() },
    300000,
  );
  const file = listFiles(claudeDir).find((x) => !before.has(x) && !x.includes('/subagents/'));
  if (!file) return { error: `no transcript, exit ${r.code}: ${r.out.slice(0, 200)}` };
  return { file, ...parseClaude(file) };
}

async function ptahCodex(q) {
  const dir = path.join(TH, '.codex', 'sessions');
  const before = new Set(listFiles(dir));
  const prompt = `Do not answer the question yourself and do not search the code yourself. Call ptah_agent_spawn one time with cli codex, model gpt-6-luna and exactly this task: '${q.replace(/'/g, '')}' Then call ptah_agent_wait until the lane ends and repeat its answer.`;
  const r = await rpc('chat:start', {
    tabId: crypto.randomUUID(),
    workspacePath: WS,
    prompt,
    options: { model: 'haiku' },
  });
  if (!r.success) return { error: `chat:start ${JSON.stringify(r).slice(0, 200)}` };
  const file = await waitFor(() => {
    const f = listFiles(dir).find((x) => !before.has(x));
    return f && parseCodex(f).done ? f : null;
  }, 360000);
  await sleep(20000); // let the haiku spawner turn end
  if (!file) return { error: 'timeout' };
  return { file, ...parseCodex(file) };
}

async function nativeCodex(q) {
  fs.mkdirSync(CODEX_NATIVE_HOME, { recursive: true });
  const link = path.join(CODEX_NATIVE_HOME, 'auth.json');
  if (!fs.existsSync(link)) fs.symlinkSync('/home/amun/.codex/auth.json', link);
  const dir = path.join(CODEX_NATIVE_HOME, 'sessions');
  const before = new Set(listFiles(dir));
  const r = await run(
    'codex',
    ['exec', '--json', '-m', 'gpt-6-luna', '-s', 'read-only', '--skip-git-repo-check', q],
    { cwd: WS, env: cleanEnv({ CODEX_HOME: CODEX_NATIVE_HOME }) },
    360000,
  );
  const file = listFiles(dir).find((x) => !before.has(x));
  if (!file) return { error: `no rollout, exit ${r.code}: ${r.out.slice(0, 200)}` };
  return { file, ...parseCodex(file) };
}

const ARMS = { 'code-mode': codeMode, 'ptah-haiku': ptahHaiku, 'native-haiku': nativeHaiku, 'ptah-codex': ptahCodex, 'native-codex': nativeCodex };
const arms = (process.argv[2] || '').split(',').filter(Boolean);
const from = Number(process.argv[3] ?? 0);
const to = Number(process.argv[4] ?? tasks.length - 1);

for (const arm of arms) {
  for (let i = from; i <= to; i++) {
    const task = tasks[i];
    const t0 = Date.now();
    let res;
    try {
      res = await ARMS[arm](task.question + SUFFIX);
    } catch (e) {
      res = { error: String(e?.message ?? e) };
    }
    const keys = KEYS[task.id];
    const ans = res.answer || '';
    const row = {
      arm,
      task: task.id,
      kind: task.kind,
      ms: Date.now() - t0,
      correct: !res.error && keys.every((k) => ans.includes(k)),
      missing: keys.filter((k) => !ans.includes(k)),
      calls: (res.calls || []).length,
      byClass: (res.calls || []).reduce((a, c) => ((a[c.cls] = (a[c.cls] || 0) + 1), a), {}),
      first: res.calls?.[0]?.name,
      seq: (res.calls || []).map((c) => `${c.cls}:${c.name}`),
      resultChars: res.resultChars,
      errors: res.errors,
      usage: res.usage || res.tok,
      turns: res.turns,
      model: res.model,
      error: res.error,
      file: res.file,
      answer: ans.slice(0, 600),
    };
    fs.appendFileSync(RESULTS, JSON.stringify(row) + '\n');
    console.log(`${arm} ${task.id} ${row.correct ? 'OK' : 'WRONG'} calls=${row.calls} ${JSON.stringify(row.byClass)} ${row.ms}ms ${row.error || ''}`);
  }
}
