// node --test scripts/verify-nx-env.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isLinkedWorktree, nxChildEnv } from './verify-nx-env.mjs';

test('linked worktree turns off an unset Nx daemon', () => {
  assert.deepEqual(nxChildEnv({ PATH: 'bin' }, true), {
    env: { PATH: 'bin', NX_DAEMON: 'false' },
    daemonDisabled: true,
  });
});

test('linked worktree preserves a caller-provided Nx daemon value', () => {
  assert.deepEqual(nxChildEnv({ NX_DAEMON: 'true' }, true), {
    env: { NX_DAEMON: 'true' },
    daemonDisabled: false,
  });
});

test('main checkout leaves the Nx daemon unset', () => {
  assert.deepEqual(nxChildEnv({ PATH: 'bin' }, false), {
    env: { PATH: 'bin' },
    daemonDisabled: false,
  });
});

test('input environment is not mutated', () => {
  const env = Object.freeze({ PATH: 'bin' });
  const result = nxChildEnv(env, true);
  assert.deepEqual(env, { PATH: 'bin' });
  assert.notStrictEqual(result.env, env);
});

test('a .git file marks a linked worktree', () => {
  const seen = [];
  const stat = (p) => (seen.push(p), { isFile: () => true });
  assert.equal(isLinkedWorktree('root/.git', stat), true);
  assert.deepEqual(seen, ['root/.git']);
});

test('a .git directory marks the main checkout', () => {
  assert.equal(
    isLinkedWorktree('root/.git', () => ({ isFile: () => false })),
    false,
  );
});

test('a missing .git entry is not a linked worktree', () => {
  assert.equal(isLinkedWorktree('root/.git', () => undefined), false);
});
