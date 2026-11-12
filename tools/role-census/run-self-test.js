#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'role-census-'));
const fixture = path.join(root, 'files');
const baselinePath = path.join(root, 'baseline.json');
const script = path.join(__dirname, 'check-role-census.ts');
const tsNode = require.resolve('ts-node/dist/bin.js');
const paths = {
  templates: 'libs/backend/agent-generation/templates/agents/sample.template.md',
  skills: '.claude/skills/sample/SKILL.md',
  'generated-agents': '.github/agents/sample.agent.md',
  docs: 'docs/sample.md',
  test: 'libs/example/src/sample.spec.ts',
  source: 'libs/example/src/sample.ts',
  other: 'config/sample.yaml',
};
function write(rel, value) {
  const target = path.join(fixture, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}
function run(...args) {
  return spawnSync(process.execPath, [tsNode, '--transpile-only', script,
    '--fixture-dir', fixture, '--baseline-path', baselinePath, ...args],
  { encoding: 'utf8' });
}
function runRaw(...args) {
  return spawnSync(process.execPath, [tsNode, '--transpile-only', script, ...args], { encoding: 'utf8' });
}
function expect(result, status, text) {
  assert.equal(result.status, status, result.stderr || result.stdout);
  if (text) assert.match(result.stdout + result.stderr, text);
}
try {
  fs.mkdirSync(fixture);
  for (const rel of Object.values(paths)) write(rel, 'backend-developer and team-leader\n');
  write('apps/x-e2e/src/a.ts', 'team-leader\n');
  write('.ptah/specs/x.md', 'team-leader\n');
  write('package-lock.json', 'team-leader\n');
  write('docs/binary.md', Buffer.from('team-leader\0\n'));
  write('docs/latin1.md', Buffer.from('team-leader \xe9\n', 'latin1'));
  const zero = Object.fromEntries([...Object.keys(paths), 'total'].map(bucket => [bucket, { lines: 0, files: 0 }]));
  fs.writeFileSync(baselinePath, JSON.stringify({ ...zero, excludes: [] }));

  // Every bucket path is classified, and two names on a line count once.
  const json = run('--json');
  expect(json, 0);
  const counts = JSON.parse(json.stdout);
  for (const bucket of Object.keys(paths)) {
    const expected = bucket === 'docs' || bucket === 'test' ? 2 : 1;
    assert.deepEqual(counts[bucket], { lines: expected, files: expected });
  }
  assert.deepEqual(counts.total, { lines: 9, files: 9 });
  assert.deepEqual(counts.skipped, { binary: 1, unreadable: 0 });

  expect(run('--update', '--force-raise', '--reason', 'self-test fixture'), 0, /Approved raise reason/);
  expect(run(), 0, /TOTAL: 9 lines/); // Equal baseline passes.

  write(paths.source, 'backend-developer and team-leader\nteam-leader\n');
  expect(run(), 1, /source: FAIL baseline 1, current 2/);
  expect(run('--update'), 1, /Refusing --update/);
  assert.equal(JSON.parse(fs.readFileSync(baselinePath)).source.lines, 1);

  write(paths.source, 'backend-developer and team-leader\n');
  write(paths.docs, 'no role here\n');
  expect(run(), 0, /docs: 1 ok \(baseline 2\); run --update to lower the baseline/);
  expect(run('--update'), 0, /baseline.json updated/);
  assert.equal(JSON.parse(fs.readFileSync(baselinePath)).docs.lines, 1);

  expect(run('--update', '--force-raise'), 2, /--force-raise requires/);
  expect(run('--update', '--force-raise', '--reason', 'short'), 2, /at least 10 characters/);
  expect(run('--force-raise', '--reason', '--update'), 2, /--reason requires a value/);
  expect(runRaw('--fixture-dir', '--json'), 2, /--fixture-dir requires a value/);
  expect(runRaw('--baseline-path', '--json'), 2, /--baseline-path requires a value/);

  const invalid = JSON.parse(fs.readFileSync(baselinePath));
  invalid.excludes = [{ path: 'docs/**' }];
  fs.writeFileSync(baselinePath, JSON.stringify(invalid));
  expect(run(), 2, /reason are required/);
  invalid.excludes = [{ reason: 'missing path' }];
  fs.writeFileSync(baselinePath, JSON.stringify(invalid));
  expect(run(), 2, /path and reason are required/);

  invalid.excludes = [{ path: './libs/example/src/sample.ts', reason: 'fixture exclusion' }];
  fs.writeFileSync(baselinePath, JSON.stringify(invalid));
  const excluded = run('--json');
  expect(excluded, 0);
  assert.deepEqual(JSON.parse(excluded.stdout).source, { lines: 0, files: 0 });

  write('root.md', 'team-leader\n');
  invalid.excludes = [{ path: '**/root.md', reason: 'glob exclusion' }];
  fs.writeFileSync(baselinePath, JSON.stringify(invalid));
  const globbed = run('--json');
  expect(globbed, 0);
  assert.deepEqual(JSON.parse(globbed.stdout).other, { lines: 1, files: 1 });
  invalid.excludes = [{ path: '**/missing.md', reason: 'stale exclusion' }];
  fs.writeFileSync(baselinePath, JSON.stringify(invalid));
  expect(run(), 2, /matches no tracked file: \*\*\/missing.md/);
  invalid.excludes = [{ path: '**/*', reason: 'overly broad' }];
  fs.writeFileSync(baselinePath, JSON.stringify(invalid));
  expect(run(), 2, /Exclusion too broad/);
  for (let i = 0; i < 51; i++) write(`many/file-${i}.md`, 'team-leader\n');
  invalid.excludes = [{ path: 'many/**', reason: 'too many paths' }];
  fs.writeFileSync(baselinePath, JSON.stringify(invalid));
  expect(run(), 2, /more than 50 tracked files/);

  console.log('role-census self-test PASS: equal/increased/decreased baselines, update guards, exclusion validation and matching, binary/Latin-1, fixed exclusions, one-line match, eight bucket paths');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
