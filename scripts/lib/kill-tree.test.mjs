import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { killTree, observeExit, stopWithFallback } from './kill-tree.mjs';

test('Windows taskkill arguments, timeout and success cases', () => {
  const calls = [];
  const deps = { platform: 'win32', spawnSync: (...args) => {
    calls.push(args);
    return { status: 0 };
  } };
  assert.equal(killTree(42, 'SIGTERM', deps).ok, true);
  assert.deepEqual(calls[0][1], ['/PID', '42', '/T', '/F']);
  assert.equal(calls[0][2].windowsHide, true);
  assert.equal(calls[0][2].timeout, 3000);
  assert.equal(killTree(42, 'SIGTERM', { ...deps, spawnSync: () => ({ status: 128 }) }).ok, true);
  assert.equal(killTree(42, 'SIGTERM', { ...deps, spawnSync: () => ({ status: 1, stderr: 'not found' }) }).ok, true);
});

test('Windows failure and timeout are reported once', () => {
  for (const result of [{ status: 5, stderr: 'denied' }, { status: null, error: new Error('timed out') }]) {
    const output = [];
    const outcome = killTree(42, 'SIGTERM', { platform: 'win32', spawnSync: () => result, stderr: { write: (s) => output.push(s) } });
    assert.equal(outcome.ok, false);
    assert.equal(output.length, 1);
  }
});

test('skips observed exits and invalid PIDs without signaling', () => {
  const child = Object.assign(new EventEmitter(), { pid: 42, exitCode: null, signalCode: null });
  observeExit(child);
  child.emit('exit', 0);
  let calls = 0;
  const deps = { platform: 'win32', spawnSync: () => { calls++; throw new Error('unexpected'); } };
  for (const target of [child, Number.NaN, -1, 0]) assert.equal(killTree(target, 'SIGTERM', deps).ok, true);
  assert.equal(calls, 0);
});

test('POSIX signals the group', () => {
  const calls = [];
  assert.equal(killTree(42, 'SIGTERM', { platform: 'linux', processKill: (...args) => calls.push(args) }).ok, true);
  assert.deepEqual(calls, [[-42, 'SIGTERM']]);
});

test('failed tree stop kills the live root once and skips an observed exit', () => {
  const child = Object.assign(new EventEmitter(), { pid: 42, exitCode: null, signalCode: null, killCalls: [], kill(signal) { this.killCalls.push(signal); } });
  observeExit(child);
  const dependencies = { platform: 'win32', spawnSync: () => ({ status: 5, stderr: 'denied' }), stderr: { write: () => true } };
  assert.equal(stopWithFallback(child, 'SIGTERM', dependencies).ok, false);
  assert.deepEqual(child.killCalls, ['SIGKILL']);
  child.emit('exit', 0);
  assert.equal(stopWithFallback(child, 'SIGTERM', { ...dependencies, spawnSync: () => { throw new Error('unexpected launch'); } }).ok, true);
  assert.deepEqual(child.killCalls, ['SIGKILL']);
});

test('thrown taskkill launch and diagnostic failure return a real Error', () => {
  const result = killTree(42, 'SIGTERM', {
    platform: 'win32', spawnSync: () => { throw new Error('launch failed'); },
    stderr: { write: () => { throw new Error('sink failed'); } },
  });
  assert.equal(result.ok, false);
  assert.ok(result.error instanceof Error);
  assert.match(result.error.message, /launch failed/);
});
