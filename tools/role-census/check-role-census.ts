#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '../..');
const BUCKETS = ['templates', 'skills', 'generated-agents', 'docs', 'test', 'source', 'other'] as const;
type Bucket = typeof BUCKETS[number];
type Entry = { path: string; content: string };
type Count = { lines: number; files: number };
type Counts = Record<Bucket | 'total', Count>;
type Exclusion = { path: string; reason: string };
type Baseline = Counts & { excludes: Exclusion[] };
type Skipped = { binary: number; unreadable: number };
const MAX_EXCLUDED_FILES = 50;
const ROLES = [
  'backend-developer', 'code-logic-reviewer', 'code-style-reviewer', 'devops-engineer',
  'frontend-developer', 'modernization-detector', 'project-manager', 'researcher-expert',
  'senior-tester', 'software-architect', 'team-leader', 'technical-content-writer',
  'ui-ux-designer', 'visual-reviewer',
];

function bucketFor(p: string): Bucket {
  if (p.startsWith('libs/backend/agent-generation/templates/')) return 'templates';
  if (p.startsWith('.claude/skills/') || /^plugins\/[^/]+\/skills\//.test(p)) return 'skills';
  if (['.claude/agents/', '.github/agents/', '.codex/agents/', '.cursor/agents/'].some(x => p.startsWith(x))) return 'generated-agents';
  if (p.startsWith('apps/ptah-docs/') || p.startsWith('docs/') || /\.mdx?$/.test(p)) return 'docs';
  if (/(?:^|\/)(?:__fixtures__|__mocks__|e2e|[^/]+-e2e)\//.test(p) || /\.(?:spec|test)\.tsx?$/.test(p)) return 'test';
  if (/\.(?:tsx?|[cm]?js)$/.test(p)) return 'source';
  return 'other';
}

function blankCounts(): Counts {
  const zero = (): Count => ({ lines: 0, files: 0 });
  return { templates: zero(), skills: zero(), 'generated-agents': zero(), docs: zero(), test: zero(), source: zero(), other: zero(), total: zero() };
}

export function countRoles(entries: Entry[]): { counts: Counts; files: Record<Bucket, { path: string; lines: number }[]> } {
  const counts = blankCounts();
  const files = Object.fromEntries(BUCKETS.map(b => [b, []])) as Record<Bucket, { path: string; lines: number }[]>;
  for (const entry of entries) {
    const lines = entry.content.split(/\r?\n/).filter(line => ROLES.some(role => line.includes(role))).length;
    if (!lines) continue;
    const bucket = bucketFor(entry.path);
    counts[bucket].lines += lines;
    counts[bucket].files++;
    counts.total.lines += lines;
    counts.total.files++;
    files[bucket].push({ path: entry.path, lines });
  }
  for (const bucket of BUCKETS) files[bucket].sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path, 'en'));
  return { counts, files };
}

function matchesGlob(file: string, glob: string): boolean {
  let pattern = '^';
  glob = glob.replace(/^\.\//, '');
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === '*' && glob[i + 1] === '*' && glob[i + 2] === '/') {
      pattern += '(?:.*/)?';
      i += 2;
    }
    else if (char === '*' && glob[i + 1] === '*') { pattern += '.*'; i++; }
    else if (char === '*') pattern += '[^/]*';
    else if (char === '?') pattern += '[^/]';
    else pattern += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
  return new RegExp(pattern + '$').test(file);
}

function readBaseline(file: string): Baseline {
  const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!raw || typeof raw !== 'object' || !('excludes' in raw) || !Array.isArray(raw.excludes)) throw new Error('Invalid baseline: excludes must be an array');
  const exclusions: unknown[] = raw.excludes;
  for (const item of exclusions) {
    if (!item || typeof item !== 'object' || !('path' in item) || typeof item.path !== 'string' || !item.path || !('reason' in item) || typeof item.reason !== 'string' || !item.reason.trim()) {
      throw new Error('Invalid exclusion: path and reason are required');
    }
    if (['**', '**/*'].includes(item.path.replace(/^\.\//, ''))) throw new Error(`Exclusion too broad: ${item.path}`);
  }
  const record: Record<string, unknown> = raw as Record<string, unknown>;
  for (const bucket of [...BUCKETS, 'total']) {
    const item = record[bucket];
    if (!item || typeof item !== 'object' || !('lines' in item) || typeof item.lines !== 'number' || !('files' in item) || typeof item.files !== 'number') throw new Error(`Invalid baseline bucket: ${bucket}`);
  }
  return raw as Baseline;
}

function isAllowed(p: string): boolean {
  if (p.startsWith('.ptah/specs/') || p.startsWith('tools/role-census/')) return false;
  if (/(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|Gemfile\.lock|poetry\.lock|Pipfile\.lock)$/.test(p)) return false;
  return true;
}

function collectFiles(fixtureDir: string | undefined, excludes: Exclusion[]): { entries: Entry[]; skipped: Skipped } {
  let paths: string[];
  let base: string;
  if (fixtureDir) {
    base = fixtureDir;
    const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(path.join(dir, item.name)) : [path.join(dir, item.name)]);
    paths = walk(base).map(p => path.relative(base, p).replace(/\\/g, '/'));
  } else {
    base = ROOT;
    const git = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 });
    if (git.status !== 0 || !git.stdout) throw new Error(`git ls-files failed: ${String(git.stderr)}`);
    paths = git.stdout.toString('utf8').split('\0').filter(Boolean);
  }
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const entries: Entry[] = [];
  const skipped: Skipped = { binary: 0, unreadable: 0 };
  for (const exclusion of excludes) {
    const matching = paths.filter(p => isAllowed(p) && matchesGlob(p, exclusion.path));
    if (matching.length === 0) throw new Error(`Exclusion matches no tracked file: ${exclusion.path}`);
    if (matching.length > MAX_EXCLUDED_FILES) throw new Error(`Exclusion matches more than ${MAX_EXCLUDED_FILES} tracked files: ${exclusion.path}`);
  }
  for (const p of paths) {
    if (!isAllowed(p) || excludes.some(e => matchesGlob(p, e.path))) continue;
    let data: Buffer;
    try { data = fs.readFileSync(path.join(base, p)); }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        skipped.unreadable++;
        continue;
      }
      throw error;
    }
    if (data.subarray(0, 8000).includes(0)) {
      skipped.binary++;
      continue;
    }
    try { entries.push({ path: p, content: decoder.decode(data) }); }
    catch (error) {
      if (!(error instanceof TypeError)) throw error;
      entries.push({ path: p, content: data.toString('latin1') });
    }
  }
  return { entries, skipped };
}

function main(): number {
  const args = process.argv.slice(2);
  const allowed = new Set(['--update', '--force-raise', '--reason', '--json', '--fixture-dir', '--baseline-path']);
  for (const arg of args) if (arg.startsWith('--') && !allowed.has(arg)) throw new Error(`Unknown argument: ${arg}`);
  const value = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    if (i < 0) return undefined;
    const candidate = args[i + 1];
    if (!candidate || candidate.startsWith('--')) throw new Error(`${flag} requires a value`);
    return candidate;
  };
  const update = args.includes('--update');
  const force = args.includes('--force-raise');
  const reason = value('--reason');
  if (reason !== undefined && reason.trim().length < 10) throw new Error('--reason requires at least 10 characters');
  if (force && (!update || !reason || reason.trim().length < 10)) throw new Error('--force-raise requires --update --reason with at least 10 characters');
  if (update && args.includes('--json')) throw new Error('--json cannot be used with --update');
  const baselinePath = value('--baseline-path') ?? path.join(__dirname, 'baseline.json');
  const baseline = readBaseline(baselinePath);
  const { entries, skipped } = collectFiles(value('--fixture-dir'), baseline.excludes);
  const { counts, files } = countRoles(entries);
  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify({ ...counts, skipped }, null, 2) + '\n');
    return skipped.unreadable > 0 ? 1 : 0;
  }
  let raised = false;
  for (const bucket of BUCKETS) {
    const current = counts[bucket].lines;
    const old = baseline[bucket].lines;
    if (current > old) {
      raised = true;
      console.log(`${bucket}: FAIL baseline ${old}, current ${current}`);
      for (const item of files[bucket].slice(0, 15)) console.log(`  ${item.path}: ${item.lines}`);
    } else if (current < old) console.log(`${bucket}: ${current} ok (baseline ${old}); run --update to lower the baseline`);
    else console.log(`${bucket}: ${current} ok (baseline ${old})`);
  }
  console.log(`TOTAL: ${counts.total.lines} lines in ${counts.total.files} files`);
  console.log(`skipped: ${skipped.binary} binary, ${skipped.unreadable} unreadable`);
  if (skipped.unreadable > 0) return 1;
  if (raised && (!update || !force)) { if (update) console.error('Refusing --update: a bucket increased'); return 1; }
  if (update) {
    if (raised) console.log(`Approved raise reason: ${reason}`);
    const next: Baseline = { ...counts, excludes: baseline.excludes };
    fs.writeFileSync(baselinePath, JSON.stringify(next, null, 2) + '\n');
    console.log('baseline.json updated (drops only unless --force-raise)');
  }
  return 0;
}

try { process.exitCode = main(); }
catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; }
