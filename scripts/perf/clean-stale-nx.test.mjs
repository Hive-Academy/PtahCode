// Run with:
//   node --test scripts/perf/clean-stale-nx.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { killTree } from '../lib/kill-tree.mjs';
import { parseArgs, classify, validateDirectory, applyRows, exitStatus, main, readLocks, isExactDaemon } from './clean-stale-nx.mjs';

const base = path.resolve('fixture');
const worktreesRoot = path.join(base, '.claude-worktrees');
const root = (name) => path.join(worktreesRoot, name);
const directory = (name) => path.join(root(name), '.nx', 'workspace-data');
const old = 48 * 3_600_000;
const now = Date.now();
const normalize = (p) => path.resolve(p).toLowerCase();
const entry = (name, extra = {}) => ({ path: root(name), directory: directory(name), pid: 123, newestMs: now - old, sizeBytes: 1024, exists: true, ...extra });
const classifyWith = (extra = {}) => classify({ roots: [entry('gone')], registered: [], main: base, current: root('active'), processes: [], locks: [], now, olderThanHours: 24, normalize, ...extra });
const daemon = (workspace, pid = 123) => ({ pid, workspace, command: `node "${path.join(base, 'node_modules', 'nx', 'dist', 'src', 'daemon', 'server', 'start.js')}" --workspace-root="${workspace}"` });

test('default main dry-run performs no removal and JSON has stable shape', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stale-nx-test-'));
  try {
    const mainRoot = path.join(tmp, 'main');
    const current = path.join(mainRoot, '.claude-worktrees', 'current');
    const target = path.join(mainRoot, '.claude-worktrees', 'gone', '.nx', 'workspace-data');
    fs.mkdirSync(target, { recursive: true });
    let applied = false;
    const deps = {
      git: (args) => args.includes('--show-toplevel') ? current : args.includes('--git-common-dir') ? path.join(mainRoot, '.git') : `worktree ${mainRoot}\nworktree ${current}`,
      readRoots: () => [{ path: path.dirname(path.dirname(target)), directory: target, newestMs: now - old, sizeBytes: 20, pid: null, exists: true }],
      readLocks: () => [], processes: () => [], normalize,
      applyRows: () => { applied = true; return []; },
    };
    const output = [];
    assert.equal(main(['--json'], { out: (s) => output.push(s) }, deps), 0);
    const result = JSON.parse(output.join(''));
    assert.equal(result.apply, false);
    assert.equal(result.rows.length, 1);
    assert.deepEqual(result.total, { count: 1, mib: 0 });
    assert.deepEqual(result.failures, []);
    assert.equal(applied, false);
    assert.equal(fs.existsSync(target), true);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
test('argument parsing rejects unknown and invalid thresholds', () => {
  assert.deepEqual(parseArgs([]), { apply: false, json: false, olderThanHours: 24 });
  for (const args of [['--bogus'], ['--older-than-hours'], ['--older-than-hours', '0']]) assert.throws(() => parseArgs(args));
});
test('main checkout and current worktree are excluded', () => {
  assert.deepEqual(classifyWith({ roots: [entry('active'), { ...entry('main'), path: base }] }), []);
});
test('realpath aliases compare equal for protected roots', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stale-nx-alias-'));
  try {
    const real = path.join(tmp, 'real');
    const alias = path.join(tmp, 'alias');
    fs.mkdirSync(real);
    fs.symlinkSync(real, alias, process.platform === 'win32' ? 'junction' : 'dir');
    assert.deepEqual(classify({ roots: [{ ...entry('alias'), path: alias }], registered: [], main: real, current: real, processes: [], locks: [], now, olderThanHours: 24 }), []);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
test('live PID, recent file, and verify holder exclude candidates', () => {
  assert.deepEqual(classifyWith({ processes: [{ pid: 123, command: 'node' }] }), []);
  assert.deepEqual(classifyWith({ roots: [entry('gone', { newestMs: now - 30_000 })] }), []);
  assert.deepEqual(classifyWith({ locks: [{ pid: 99, worktree: root('gone') }], processes: [{ pid: 99, command: 'node' }] }), []);
});
test('age threshold filters registered worktrees; removed ones need one quiet hour', () => {
  assert.equal(classifyWith({ registered: [root('gone')], olderThanHours: 72 }).length, 0);
  assert.equal(classifyWith({ olderThanHours: 72 }).length, 1);
});
test('removed worktree directory is a candidate', () => {
  assert.equal(classifyWith()[0].reason, 'worktree not registered or missing');
});
test('verify lock reader reads numbered holders and reports malformed locks', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stale-nx-lock-'));
  try {
    fs.writeFileSync(path.join(tmp, 'holder-2.json'), JSON.stringify({ pid: 22, worktree: root('gone') }));
    fs.writeFileSync(path.join(tmp, 'holder.json'), '{');
    const failures = [];
    assert.deepEqual(readLocks(failures, tmp), [{ pid: 22, worktree: root('gone') }]);
    assert.equal(failures.length, 1);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
test('outside path and junction escape are refused', () => {
  assert.throws(() => validateDirectory(path.join(base, '.nx', 'workspace-data'), worktreesRoot));
  assert.throws(() => validateDirectory(directory('gone'), worktreesRoot));
});
test('exact daemon stops; sibling-prefix and unattributable processes do not', () => {
  const exact = daemon(root('wt'));
  const sibling = daemon(root('wt-long'));
  assert.equal(isExactDaemon(exact, root('wt'), normalize), true);
  assert.equal(isExactDaemon({ ...sibling, workspace: root('wt') }, root('wt'), normalize), false);
  const killed = [];
  const rows = [{ kind: 'process', path: root('wt'), pid: 123 }];
  assert.deepEqual(applyRows(rows, { worktreesRoot, processes: () => [{ pid: 123, command: exact.command }], stop: (pid) => killed.push(pid), normalize }), []);
  assert.deepEqual(killed, [123]);
  assert.equal(applyRows(rows, { worktreesRoot, processes: () => [sibling], stop: (pid) => killed.push(pid), normalize }).length, 1);
  assert.equal(applyRows(rows, { worktreesRoot, processes: () => [{ pid: 123, command: exact.command.replace(root('wt'), root('unproved')) }], stop: (pid) => killed.push(pid), normalize }).length, 1);
  assert.deepEqual(killed, [123]);
});
test('main attribution does not assign a sibling-prefix daemon to a removed worktree', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stale-nx-attribution-'));
  try {
    const mainRoot = path.join(tmp, 'main');
    const current = path.join(mainRoot, '.claude-worktrees', 'current');
    const short = path.join(mainRoot, '.claude-worktrees', 'wt');
    const long = path.join(mainRoot, '.claude-worktrees', 'wt-long');
    const output = [];
    const deps = {
      git: (args) => args.includes('--show-toplevel') ? current : args.includes('--git-common-dir') ? path.join(mainRoot, '.git') : `worktree ${mainRoot}\nworktree ${current}\nworktree ${long}`,
      readRoots: () => [
        { path: short, directory: path.join(short, '.nx', 'workspace-data'), newestMs: now - old, sizeBytes: 1 },
        { path: long, directory: path.join(long, '.nx', 'workspace-data'), newestMs: now - old, sizeBytes: 1 },
      ],
      readLocks: () => [], processes: () => [daemon(long)], normalize,
    };
    assert.equal(main(['--json'], { out: (s) => output.push(s) }, deps), 0);
    assert.equal(JSON.parse(output.join('')).rows.some((row) => row.kind === 'process'), false);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
test('in-tree junction is refused and its target content stays intact', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stale-nx-link-'));
  try {
    const worktreesRoot = path.join(tmp, '.claude-worktrees');
    const target = path.join(worktreesRoot, 'gone', '.nx', 'workspace-data');
    const outside = path.join(tmp, 'outside');
    fs.mkdirSync(target, { recursive: true });
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'keep.txt'), 'keep');
    fs.symlinkSync(outside, path.join(target, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
    const failures = applyRows([{ kind: 'directory', path: target }], { worktreesRoot, processes: () => [] });
    assert.match(failures[0], /symlink or junction/);
    assert.equal(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'keep');
    assert.equal(fs.existsSync(target), true);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
test('link to another worktree data is refused', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stale-nx-link-'));
  try {
    const worktreesRoot = path.join(tmp, '.claude-worktrees');
    const other = path.join(worktreesRoot, 'other', '.nx', 'workspace-data');
    const link = path.join(worktreesRoot, 'gone', '.nx', 'workspace-data');
    fs.mkdirSync(other, { recursive: true });
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(other, link, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => validateDirectory(link, worktreesRoot), /symlink or junction|link to another/);
    assert.equal(fs.existsSync(other), true);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
test('already removed directory succeeds; removal failure is nonzero', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stale-nx-test-'));
  try {
    const worktreesRoot = path.join(tmp, '.claude-worktrees');
    const target = path.join(worktreesRoot, 'gone', '.nx', 'workspace-data');
    assert.deepEqual(applyRows([{ kind: 'directory', path: target }], { worktreesRoot, processes: () => [] }), []);
    fs.mkdirSync(target, { recursive: true });
    const stale = new Date(now - old);
    fs.utimesSync(target, stale, stale);
    const failures = applyRows([{ kind: 'directory', path: target }], { worktreesRoot, processes: () => [], remove: () => { throw new Error('denied'); } });
    assert.match(failures[0], /denied/);
    assert.equal(exitStatus(failures), 1);
    assert.equal(fs.existsSync(target), true);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('a taskkill failure is recorded as an apply failure', () => {
  const failure = killTree(42, 'SIGTERM', {
    platform: 'win32', env: { SystemRoot: 'C:/Windows' }, spawnSync: () => ({ status: 5, stderr: 'access denied' }),
    stderr: { write: () => true },
  });
  assert.equal(failure.ok, false);
  const failures = applyRows([{ kind: 'process', pid: 42, path: root('gone') }], {
    worktreesRoot, processes: () => [daemon(root('gone'), 42)],
    stop: () => { throw failure.error; },
  });
  assert.equal(exitStatus(failures), 1);
  assert.match(failures.join(' '), /access denied/);
});
