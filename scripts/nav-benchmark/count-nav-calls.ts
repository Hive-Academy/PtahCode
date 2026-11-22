/**
 * Transcript counter for the adoption measurement (TASK_2026_2299_d6f5).
 *
 * Counts, over the last N days, how often agents navigate with the shell
 * (`rg`/`grep`, `sed -n` ranges, `cat`), with `Read`, and with the ptah
 * navigation tools. Run it now and again later; compare the two outputs.
 * The offline benchmark does not prove adoption, this counter does.
 *
 * Usage (repository root):
 *   npx ts-node --transpile-only --project scripts/tsconfig.json -O '{"rootDir":"."}' \
 *     scripts/nav-benchmark/count-nav-calls.ts [--days 14] [--project-prefix -home-amun-ptah-extension]
 *
 * Reads `~/.claude/projects/<prefix>*` Claude transcripts and `~/.codex/sessions`
 * Codex rollouts, read-only. Prints counts only, no command text.
 */
import { readdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import {
  asObject,
  asString,
  collectJsonlFiles,
  readJsonLines,
} from '../agent-usage/jsonl-files';

export type NavCategory =
  | 'shell-grep'
  | 'shell-sed-range'
  | 'shell-cat'
  | 'read'
  | 'ptah-nav'
  | 'other';

export const PTAH_NAV_TOOLS: readonly string[] = [
  'ptah_read_symbol',
  'ptah_grep',
  'ptah_code_search_symbols',
  'ptah_ast_analyze',
  'ptah_context_enrich_file',
  'ptah_search_files',
  'ptah_lsp_references',
  'ptah_lsp_definitions',
  'ptah_get_dependents',
  'ptah_get_dependencies',
  'ptah_get_symbol_index',
  'ptah_relevance_rank_files',
];

/** Matches the Claude tool name `mcp__ptah__ptah_grep` as well as `ptah_grep`. */
export function ptahToolOf(toolName: string): string | undefined {
  const bare = toolName.replace(/^mcp__[^_]+(?:_[^_]+)*__/, '');
  return PTAH_NAV_TOOLS.includes(bare) ? bare : undefined;
}

/** Categories of one shell command; a command can fall in several. */
export function classifyShell(command: string): NavCategory[] {
  const out: NavCategory[] = [];
  if (/(^|[\s|;&(])(rg|grep|egrep|fgrep)\s/.test(command)) {
    out.push('shell-grep');
  }
  if (/\bsed\s+-n\s+['"]?\d+,\d+p/.test(command)) {
    out.push('shell-sed-range');
  }
  if (/(^|[\s|;&(])cat\s+[^|<>]/.test(command)) {
    out.push('shell-cat');
  }
  return out;
}

export type Counts = Record<NavCategory, number> & {
  total: number;
  perPtahTool: Record<string, number>;
};

export function emptyCounts(): Counts {
  return {
    'shell-grep': 0,
    'shell-sed-range': 0,
    'shell-cat': 0,
    read: 0,
    'ptah-nav': 0,
    other: 0,
    total: 0,
    perPtahTool: {},
  };
}

/** Adds one tool call. `command` is the shell command for a shell tool. */
export function addCall(
  counts: Counts,
  toolName: string,
  command: string | null | undefined,
): void {
  counts.total += 1;
  const ptah = ptahToolOf(toolName);
  if (ptah !== undefined) {
    counts['ptah-nav'] += 1;
    counts.perPtahTool[ptah] = (counts.perPtahTool[ptah] ?? 0) + 1;
    return;
  }
  if (toolName === 'Read') {
    counts.read += 1;
    return;
  }
  const categories = command == null ? [] : classifyShell(command);
  if (categories.length === 0) {
    counts.other += 1;
    return;
  }
  for (const category of categories) counts[category] += 1;
}

function parseArgs(argv: readonly string[]): { days: number; prefix: string } {
  let days = 14;
  let prefix = '-home-amun-ptah-extension';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--days') days = Number(argv[++i]);
    else if (argv[i] === '--project-prefix') prefix = String(argv[++i]);
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!Number.isFinite(days) || days <= 0)
    throw new Error('--days must be > 0');
  return { days, prefix };
}

function countClaude(since: number, prefix: string, counts: Counts): void {
  const root = join(homedir(), '.claude', 'projects');
  if (!existsSync(root)) return;
  for (const dir of readdirSync(root).filter((n) => n.startsWith(prefix))) {
    for (const file of collectJsonlFiles(join(root, dir), {
      modifiedSinceMs: since,
    })) {
      for (const record of readJsonLines(file).records) {
        const content = asObject(asObject(record)['message'])['content'];
        if (!Array.isArray(content)) continue;
        for (const block of content) {
          const b = asObject(block);
          if (b['type'] !== 'tool_use') continue;
          const name = asString(b['name']) ?? '';
          addCall(counts, name, asString(asObject(b['input'])['command']));
        }
      }
    }
  }
}

function countCodex(since: number, counts: Counts): void {
  const root = join(homedir(), '.codex', 'sessions');
  if (!existsSync(root)) return;
  for (const file of collectJsonlFiles(root, { modifiedSinceMs: since })) {
    for (const record of readJsonLines(file).records) {
      const payload = asObject(asObject(record)['payload']);
      if (payload['type'] !== 'custom_tool_call') continue;
      const name = asString(payload['name']) ?? '';
      addCall(counts, name, asString(payload['input']));
    }
  }
}

function main(): void {
  const { days, prefix } = parseArgs(process.argv.slice(2));
  const since = Date.now() - days * 86_400_000;
  const claude = emptyCounts();
  const codex = emptyCounts();
  countClaude(since, prefix, claude);
  countCodex(since, codex);
  process.stdout.write(
    `${JSON.stringify({ days, date: new Date().toISOString(), claude, codex }, null, 2)}\n`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(
      `count-nav-calls: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
  }
}
