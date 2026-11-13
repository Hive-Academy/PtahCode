// Tests for the argument logic of scripts/verify.mjs.
//
//   node --test scripts/verify-args.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planPhases } from './verify-args.mjs';

test('default run is nx affected for lint and typecheck, then test', () => {
  const phases = planPhases({ base: 'main' });
  assert.deepEqual(
    phases.map((phase) => phase.args),
    [
      ['affected', '-t', 'lint,typecheck', '--base=main', '--parallel=2'],
      ['affected', '-t', 'test', '--base=main', '--parallel=1'],
    ],
  );
});

test('projects use run-many and keep the extra arguments last', () => {
  const [phase] = planPhases(
    { base: 'main', projects: ['a,b'], targets: ['test'] },
    ['--testPathPatterns=foo'],
  );
  assert.deepEqual(phase.args, [
    'run-many',
    '-t',
    'test',
    '-p',
    'a,b',
    '--parallel=1',
    '--testPathPatterns=foo',
  ]);
});

test('--related runs only tests with --changedSince before extra arguments', () => {
  const phases = planPhases(
    { base: 'origin/main', projects: ['a'], related: true },
    ['--verbose'],
  );
  assert.equal(phases.length, 1);
  assert.deepEqual(phases[0].args, [
    'run-many',
    '-t',
    'test',
    '-p',
    'a',
    '--parallel=1',
    '--changedSince=origin/main',
    '--verbose',
  ]);
  assert.match(phases[0].label, /related to origin\/main/);
});

test('--related accepts an explicit test target', () => {
  const phases = planPhases({
    base: 'main',
    projects: ['a'],
    targets: ['test'],
    related: true,
  });
  assert.equal(phases[0].targetList, 'test');
});

test('--related without projects is an error', () => {
  assert.throws(
    () => planPhases({ base: 'main', related: true }),
    /--related needs projects/,
  );
});

test('--related with a target other than test is an error', () => {
  assert.throws(
    () =>
      planPhases({
        base: 'main',
        projects: ['a'],
        targets: ['lint,test'],
        related: true,
      }),
    /test target only/,
  );
});

test('affected keeps a custom base, the head and the lint parallel value', () => {
  const phases = planPhases(
    { base: 'origin/main', head: 'HEAD~1' },
    ['--skip-nx-cache'],
    4,
  );
  assert.deepEqual(
    phases.map((phase) => phase.args),
    [
      [
        'affected',
        '-t',
        'lint,typecheck',
        '--base=origin/main',
        '--head=HEAD~1',
        '--parallel=4',
        '--skip-nx-cache',
      ],
      [
        'affected',
        '-t',
        'test',
        '--base=origin/main',
        '--head=HEAD~1',
        '--parallel=1',
        '--skip-nx-cache',
      ],
    ],
  );
  assert.deepEqual(
    phases.map((phase) => `${phase.targetList} (${phase.label})`),
    [
      'lint,typecheck (affected vs origin/main)',
      'test (affected vs origin/main)',
    ],
  );
});

test('run-many ignores the head and labels the run with the projects', () => {
  const [phase] = planPhases({
    base: 'main',
    head: 'HEAD~1',
    projects: ['a', 'b'],
    targets: ['lint'],
  });
  assert.deepEqual(phase.args, [
    'run-many',
    '-t',
    'lint',
    '-p',
    'a,b',
    '--parallel=2',
  ]);
  assert.equal(phase.label, 'a,b');
});

test('--related with an explicit test target still adds --changedSince', () => {
  const [phase] = planPhases({
    base: 'main',
    projects: ['a'],
    targets: ['test'],
    related: true,
  });
  assert.ok(phase.args.includes('--changedSince=main'));
});
