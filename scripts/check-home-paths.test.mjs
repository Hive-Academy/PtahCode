// Tests for the home-path privacy guard (scripts/check-home-paths.mjs).
//
//   node scripts/verify.mjs --exec --task home-paths-test -- node --test scripts/check-home-paths.test.mjs
//
// Sample paths are built from parts so this file never holds a full home path.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkFiles, findHomePathHits, isAllowedSegment } from './check-home-paths.mjs';

const BS = String.fromCharCode(92);
const WIN = `C:${BS}Users${BS}`;
const WIN_JSON = `C:${BS}${BS}Users${BS}${BS}`;
const WIN_FWD = 'C:' + '/Users/';
const MAC = '/Us' + 'ers/';
const LINUX = '/ho' + 'me/';
const NAME = 'jane' + 'doe';

test('flags a real user segment in every path style', () => {
  const samples = [
    `${WIN}${NAME}${BS}proj`,
    `${WIN_FWD}${NAME}/proj`,
    `"${WIN_JSON}${NAME}${BS}${BS}proj"`,
    `cwd=${MAC}${NAME}/proj`,
    `/c${MAC}${NAME}/proj`,
    `at ${LINUX}${NAME}/proj`,
    `C--Users-${NAME}-proj`,
  ];
  for (const sample of samples) {
    const hits = findHomePathHits(sample);
    assert.equal(hits.length, 1, sample);
    assert.equal(hits[0].segment, NAME);
  }
});

test('allows neutral segments and placeholders', () => {
  const samples = [
    `${WIN}dev${BS}x`,
    `${WIN}<user>${BS}x`,
    `${WIN}%USERPROFILE%${BS}x`,
    `${WIN}$env:USERNAME${BS}x`,
    `${WIN}{name}${BS}x`,
    `${WIN}Public${BS}x`,
    `${WIN}Default${BS}x`,
    `${WIN}runneradmin${BS}x`,
    `${MAC}user/x`,
    `${LINUX}runner/x`,
    `${LINUX}.ptah/x`,
    'C--Users-dev-proj',
  ];
  for (const sample of samples) {
    assert.deepEqual(findHomePathHits(sample), [], sample);
  }
});

test('ignores paths that only contain the folder names as a part', () => {
  assert.deepEqual(findHomePathHits(`import x from 'src${MAC}${NAME}.ts'`), []);
  assert.deepEqual(findHomePathHits(`/app${LINUX}${NAME}/x`), []);
});

test('reports the line number', () => {
  const hits = findHomePathHits(`one\ntwo ${WIN}${NAME}${BS}x\nthree`);
  assert.deepEqual(hits, [{ line: 2, segment: NAME }]);
});

test('isAllowedSegment is case-insensitive', () => {
  assert.equal(isAllowedSegment('DEV'), true);
  assert.equal(isAllowedSegment(NAME), false);
});

test('checkFiles skips binary and missing files and flags text files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'home-paths-'));
  try {
    const bad = path.join(dir, 'bad.txt');
    const binary = path.join(dir, 'bin.dat');
    fs.writeFileSync(bad, `${WIN}${NAME}${BS}x`);
    fs.writeFileSync(binary, Buffer.concat([Buffer.from([0]), Buffer.from(`${WIN}${NAME}${BS}x`)]));
    const failures = checkFiles([bad, binary, path.join(dir, 'missing.txt')]);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].file, bad);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
