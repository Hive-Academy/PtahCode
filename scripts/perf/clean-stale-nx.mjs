import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { killTree } from '../lib/kill-tree.mjs';

const HOUR = 3_600_000;
const here = path.dirname(fileURLToPath(import.meta.url));
const scriptRoot = path.resolve(here, '../..');

export function parseArgs(args) {
  const options = { apply: false, json: false, olderThanHours: 24 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') options.apply = true;
    else if (args[i] === '--json') options.json = true;
    else if (args[i] === '--older-than-hours') {
      const value = Number(args[++i]);
      if (!Number.isFinite(value) || value < 1) throw new Error('Expected --older-than-hours >= 1');
      options.olderThanHours = value;
    } else throw new Error(`Unknown argument: ${args[i]}`);
  }
  return options;
}

const lexicalKey = (value) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
const key = (value) => {
  try { return lexicalKey(fs.realpathSync.native(value)); }
  catch (error) {
    // Git may retain a missing worktree registration. Existing candidates are realpathed by validateDirectory.
    if (error.code === 'ENOENT') return lexicalKey(value);
    throw error;
  }
};
const inside = (parent, child) => {
  const relative = path.relative(key(parent), key(child));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

export function validateDirectory(target, worktreesRoot, realpath = fs.realpathSync.native, lstat = fs.lstatSync) {
  if (path.basename(target) !== 'workspace-data' || path.basename(path.dirname(target)) !== '.nx')
    throw new Error(`Refused directory shape: ${target}`);
  if (!inside(worktreesRoot, target) || path.relative(worktreesRoot, target).split(path.sep).length !== 3)
    throw new Error(`Refused directory outside worktrees: ${target}`);
  const relative = path.relative(worktreesRoot, target);
  for (const segment of [path.dirname(path.dirname(target)), path.dirname(target), target]) {
    const info = lstat(segment);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Refused symlink or junction: ${segment}`);
  }
  const realRoot = realpath(worktreesRoot);
  const realTarget = realpath(target);
  if (!inside(realRoot, realTarget) || path.relative(realRoot, realTarget).split(path.sep).length !== 3)
    throw new Error(`Refused symlink or junction escape: ${target}`);
  if (lexicalKey(realTarget) !== lexicalKey(path.join(realRoot, relative))) throw new Error(`Refused link to another worktree: ${target}`);
  return realTarget;
}

export function classify({ roots, registered, main, current, processes, locks, now, olderThanHours, normalize = key }) {
  const live = new Map(processes.map((p) => [Number(p.pid), p]));
  const known = new Set(registered.map(normalize));
  const locked = new Set(locks.filter((l) => live.has(Number(l.pid)) || live.has(Number(l.childPid))).map((l) => normalize(l.worktree)));
  const rows = [];
  for (const root of roots) {
    if (normalize(root.path) === normalize(main) || normalize(root.path) === normalize(current) || locked.has(normalize(root.path))) continue;
    const ageMs = Math.max(0, now - root.newestMs);
    if (ageMs < HOUR) continue;
    const daemon = live.get(Number(root.pid));
    if (daemon) continue;
    const removed = !known.has(normalize(root.path)) || !root.exists;
    if (!removed && ageMs < olderThanHours * HOUR) continue;
    const reason = removed ? 'worktree not registered or missing' : 'no live recorded daemon; old content';
    rows.push({ kind: 'directory', path: root.directory, pid: root.pid ?? null, ageHours: +(ageMs / HOUR).toFixed(1), sizeBytes: root.sizeBytes, reason, action: 'remove' });
  }
  // Only a command line naming the exact workspace is enough to attribute a process.
  for (const proc of processes) {
    if (!proc.workspace || known.has(normalize(proc.workspace)) || normalize(proc.workspace) === normalize(main) || normalize(proc.workspace) === normalize(current)) continue;
    if (locked.has(normalize(proc.workspace)) || !isExactDaemon(proc, proc.workspace, normalize)) continue;
    rows.push({ kind: 'process', path: proc.workspace, pid: proc.pid, ageHours: null, sizeBytes: 0, reason: 'workspace not registered', action: 'stop' });
  }
  return rows;
}

export function commandNamesWorkspace(command, root) {
  const text = process.platform === 'win32' ? command.replaceAll('\\', '/').toLowerCase() : command.replaceAll('\\', '/');
  const target = process.platform === 'win32' ? path.resolve(root).replaceAll('\\', '/').toLowerCase() : path.resolve(root).replaceAll('\\', '/');
  const escape = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[\\s"'=])${escape}(?=$|[/\\s"'])`).test(text);
}

export function isExactDaemon(proc, root, normalize = key) {
  const command = proc.command ?? '';
  return /(?:^|[\\/])nx[\\/]dist[\\/]src[\\/]daemon[\\/]server[\\/]start\.js(?:\s|$|["'])/i.test(command)
    && commandNamesWorkspace(command, root) && (!proc.workspace || normalize(proc.workspace) === normalize(root));
}

function run(file, args) { return execFileSync(file, args, { encoding: 'utf8', windowsHide: true }); }
function git(args) { return run('git', args).trim(); }
function processes() {
  if (process.platform === 'win32') {
    const script = "Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress";
    const raw = run('powershell', ['-NoProfile', '-Command', script]);
    return (raw.trim() ? [JSON.parse(raw)].flat() : []).map((p) => ({ pid: p.ProcessId, command: p.CommandLine ?? '' }));
  }
  return run('ps', ['-eo', 'pid=,args=']).split('\n').map((line) => {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line);
    return match && { pid: Number(match[1]), command: match[2] };
  }).filter(Boolean);
}

function inspectTree(directory) {
  let newestMs = fs.lstatSync(directory).mtimeMs, sizeBytes = 0;
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || entry.isSymbolicLink()) throw new Error(`Refused symlink or junction in directory: ${file}`);
      if (stat.isDirectory()) visit(file);
      else { newestMs = Math.max(newestMs, stat.mtimeMs); sizeBytes += stat.size; }
    }
  };
  visit(directory);
  return { newestMs, sizeBytes };
}

function readRoots(worktreesRoot, failures) {
  if (!fs.existsSync(worktreesRoot)) return [];
  const roots = [];
  for (const entry of fs.readdirSync(worktreesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const root = path.join(worktreesRoot, entry.name);
    const directory = path.join(root, '.nx', 'workspace-data');
    if (!fs.existsSync(directory)) continue;
    try {
      validateDirectory(directory, worktreesRoot);
      const info = inspectTree(directory);
      const meta = path.join(directory, 'd', 'server-process.json');
      const pid = fs.existsSync(meta) ? JSON.parse(fs.readFileSync(meta, 'utf8')).processId : null;
      roots.push({ path: root, directory, exists: true, pid, ...info });
    } catch (error) { failures.push(`${directory}: ${error.message}`); }
  }
  return roots;
}

export function readLocks(failures, dir = process.env.PTAH_VERIFY_LOCK_DIR || path.join(os.tmpdir(), 'ptah-verify-lock')) {
  if (!fs.existsSync(dir)) return [];
  const locks = [];
  for (const name of fs.readdirSync(dir).filter((n) => /^holder(?:-\d+)?\.json$/.test(n))) {
    try {
      const holder = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      if (typeof holder.worktree !== 'string' || !Number.isInteger(holder.pid)) throw new Error('Invalid holder fields');
      locks.push(holder);
    }
    catch (error) { failures.push(`Cannot read verify lock ${name}: ${error.message}`); }
  }
  return locks;
}

export function applyRows(rows, { worktreesRoot, processes: currentProcesses, remove = (p) => fs.rmSync(p, { recursive: true, force: true }), stop, realpath = fs.realpathSync.native, protectedRoot = () => false, normalize = key }) {
  const failures = [];
  for (const row of rows.filter((r) => r.kind === 'process')) {
    try {
      if (protectedRoot(row.path)) throw new Error('Workspace became protected');
      const proc = currentProcesses().find((p) => Number(p.pid) === Number(row.pid));
      if (!proc || !isExactDaemon(proc, row.path, normalize)) throw new Error('PID identity changed or workspace not in command line');
      stop(row.pid);
    } catch (error) { failures.push(`${row.path}: ${error.message}`); }
  }
  for (const row of rows.filter((r) => r.kind === 'directory')) {
    try {
      if (protectedRoot(path.dirname(path.dirname(row.path)))) throw new Error('Workspace became protected');
      if (!fs.existsSync(row.path)) continue;
      const target = validateDirectory(row.path, worktreesRoot, realpath);
      const info = inspectTree(target);
      if (Date.now() - info.newestMs < HOUR) throw new Error('A file changed within the last hour');
      const meta = path.join(target, 'd', 'server-process.json');
      if (fs.existsSync(meta)) {
        const pid = JSON.parse(fs.readFileSync(meta, 'utf8')).processId;
        if (currentProcesses().some((p) => Number(p.pid) === Number(pid))) throw new Error('Recorded daemon PID is live');
      }
      remove(target);
    } catch (error) { failures.push(`${row.path}: ${error.message}`); }
  }
  return failures;
}

export function exitStatus(failures) { return failures.length ? 1 : 0; }

export function main(args = process.argv.slice(2), io = {}, deps = {}) {
  const out = io.out ?? console.log;
  const err = io.err ?? console.error;
  const options = parseArgs(args);
  const gitCommand = deps.git ?? git;
  const listProcesses = deps.processes ?? processes;
  const scanRoots = deps.readRoots ?? readRoots;
  const scanLocks = deps.readLocks ?? readLocks;
  const apply = deps.applyRows ?? applyRows;
  const current = gitCommand(['-C', scriptRoot, 'rev-parse', '--show-toplevel']);
  const common = path.resolve(current, gitCommand(['-C', current, 'rev-parse', '--git-common-dir']));
  const mainRoot = path.dirname(common);
  const worktreesRoot = path.join(mainRoot, '.claude-worktrees');
  const registered = gitCommand(['-C', current, 'worktree', 'list', '--porcelain']).split('\n').filter((s) => s.startsWith('worktree ')).map((s) => s.slice(9));
  const failures = [];
  const processList = listProcesses();
  const roots = scanRoots(worktreesRoot, failures);
  for (const proc of processList) {
    const matches = roots.filter((root) => commandNamesWorkspace(proc.command, root.path));
    if (matches.length === 1) proc.workspace = matches[0].path;
    else if (/daemon[\\/]server[\\/]start\.js/i.test(proc.command)) proc.attribution = 'not attributable';
  }
  const rows = classify({ roots, registered, main: mainRoot, current, processes: processList, locks: scanLocks(failures), now: Date.now(), olderThanHours: options.olderThanHours, normalize: deps.normalize });
  if (options.apply && failures.length === 0) failures.push(...apply(rows, {
    worktreesRoot, processes: listProcesses, normalize: deps.normalize,
    protectedRoot: (root) => {
      const normalize = deps.normalize ?? key;
      const active = gitCommand(['-C', current, 'worktree', 'list', '--porcelain']).split('\n').filter((s) => s.startsWith('worktree ')).map((s) => normalize(s.slice(9)));
      const before = failures.length;
      const holders = scanLocks(failures);
      if (failures.length !== before) throw new Error('Cannot verify lock holders');
      const live = listProcesses();
      return normalize(root) === normalize(mainRoot) || normalize(root) === normalize(current) || active.includes(normalize(root)) && !registered.map(normalize).includes(normalize(root)) || holders.some((h) => normalize(h.worktree) === normalize(root) && (live.some((p) => p.pid === h.pid || p.pid === h.childPid)));
    },
    stop: (pid) => {
      if (process.platform !== 'win32') return process.kill(pid, 'SIGTERM');
      const result = killTree(pid);
      if (!result.ok) throw result.error;
    },
  }));
  const unattributable = processList.filter((p) => p.attribution === 'not attributable').map((p) => ({ pid: p.pid, reason: 'not attributable' }));
  const result = { apply: options.apply, rows, unattributable, total: { count: rows.length, mib: +(rows.reduce((n, r) => n + r.sizeBytes, 0) / 1048576).toFixed(2) }, failures };
  if (options.json) out(JSON.stringify(result, null, 2));
  else {
    out('kind | path | PID | age (h) | size (MiB) | reason | action');
    for (const r of rows) out(`${r.kind} | ${r.path} | ${r.pid ?? '-'} | ${r.ageHours ?? '-'} | ${(r.sizeBytes / 1048576).toFixed(2)} | ${r.reason} | ${r.action}`);
    out(`Total: ${result.total.count} candidates, ${result.total.mib} MiB`);
    for (const proc of unattributable) out(`process | not attributable | ${proc.pid} | - | - | workspace not proved | skip`);
    for (const failure of failures) err(`Failed: ${failure}`);
  }
  return exitStatus(failures);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); }
  catch (error) { console.error(error.message); process.exitCode = 2; }
}
