// Privacy guard: fail when a text file carries an absolute home path with a
// real user segment. The repository is public, so a Windows profile path, a
// macOS `/Users/<name>` path or a Linux `/home/<name>` path must not be
// committed with a real user name.
//
//   node scripts/check-home-paths.mjs <file...>   check the given files
//   node scripts/check-home-paths.mjs --all       check every tracked file
//
// lint-staged runs the first form on staged files (.lintstagedrc.mjs).
// Neutral segments (see ALLOWED_SEGMENTS) and placeholders (`%X%`, `$X`,
// `{x}`, `<x>`, `~`, wildcards, dot-folders) pass. Use `dev` or `<user>` in
// new text.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const BS = String.fromCharCode(92);
// One or more separators: `\`, `\\` (JSON-escaped, any depth) or `/`.
const SEP = `(?:${BS}${BS}+|/)+`;
// A user segment: everything up to a separator, quote, space or bracket.
const SEGMENT = `([^${BS}${BS}/${BS}s"'\`,;|)${BS}]}]+)`;
// What may precede a rooted path such as `/home/...`.
const START = `(?:^|[${BS}s"'\`(=:,${BS}[{])`;

/** Each pattern captures the user segment in group 1. */
const PATTERNS = [
  // Drive path: <drive>:\Users\name, <drive>:/Users/name, JSON-escaped forms
  new RegExp(`[A-Za-z]:${SEP}Users${SEP}${SEGMENT}`, 'gi'),
  // macOS /Users/name and Git Bash /c/Users/name
  new RegExp(`(?:${START}|${START}/[A-Za-z])/Users/${SEGMENT}`, 'gi'),
  // Linux /home/name
  new RegExp(`${START}/home/${SEGMENT}`, 'gi'),
  // Claude project folder names: <drive>--Users-name
  new RegExp(`[A-Za-z]--Users-([^-${BS}s"'\`${BS}${BS}/]+)`, 'gi'),
];

/** Neutral user segments (compared in lower case). */
export const ALLOWED_SEGMENTS = new Set([
  'user',
  'dev',
  'runner',
  'runneradmin',
  'public',
  'default',
  'example',
  'all users',
  // Fake names that tests and docs already use.
  ...['me', 'u', 'x', 'a', 'b', 'ann', 'ada', 'bob', 'carol', 'charlie', 'dana', 'alice'],
  ...['someone', 'testuser', 'test', 'fixture', 'other', 'secret', 'private', 'agent', 'acct'],
  ...['account-a', 'codex', 'codex-a', 'codex-b', 'codex.toml', 'ptah', 'amun', 'amun-bound'],
  ...['horus', 'zoë', 'acme', 'developer', 'documents', 'linuxbrew', 'unknown-profile', '...'],
  ...['dave', 'person', 'renée', 'jane', 'jane[work', 'host', 'josé', 'project', 'ptah-e2e'],
  ...['bench', 'name', 'file.js', 'app.ts'],
]);

const MAX_BYTES = 4 * 1024 * 1024;

function isPlaceholder(segment) {
  // Placeholders, wildcards and dot-folders (`/home/.ptah` has no user segment).
  // 8.3 short names (`NAME~1`) are abbreviations, not full names.
  return /^[%$<{~*[.]/.test(segment) || segment.includes('*') || /~\d+$/.test(segment);
}

export function isAllowedSegment(segment) {
  return ALLOWED_SEGMENTS.has(segment.toLowerCase()) || isPlaceholder(segment);
}

/** Returns `{ line, segment }` for each disallowed home path in `text`. */
export function findHomePathHits(text) {
  const hits = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const seen = new Set(); // two patterns can match the same path
    for (const pattern of PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of lines[i].matchAll(pattern)) {
        if (isAllowedSegment(match[1]) || seen.has(match[1])) continue;
        seen.add(match[1]);
        hits.push({ line: i + 1, segment: match[1] });
      }
    }
  }
  return hits;
}

function readTextFile(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return null; // deleted or missing: nothing to check
  }
  if (!stat.isFile() || stat.size > MAX_BYTES) return null;
  const buffer = fs.readFileSync(file);
  return buffer.includes(0) ? null : buffer.toString('utf8'); // skip binary
}

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  return out.split('\0').filter(Boolean);
}

export function checkFiles(files) {
  const failures = [];
  for (const file of files) {
    const text = readTextFile(file);
    if (text === null) continue;
    for (const hit of findHomePathHits(text)) failures.push({ file, ...hit });
  }
  return failures;
}

function main(argv) {
  const files = argv.includes('--all') ? trackedFiles() : argv.filter((a) => !a.startsWith('--'));
  const failures = checkFiles(files);
  for (const f of failures) {
    // The segment itself is not printed: it may be a private name.
    console.error(`${f.file}:${f.line}: home path with a real user name`);
  }
  if (failures.length > 0) {
    console.error(
      `\ncheck-home-paths: ${failures.length} hit(s). Replace the user segment with ` +
        '`dev` or `<user>` (see scripts/check-home-paths.mjs).',
    );
    return 1;
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv.slice(2)));
}
