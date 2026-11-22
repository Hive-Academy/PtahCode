/**
 * Drift guards for the tool substitution guidance (single-source task).
 *
 * The rows live in `TOOL_SUBSTITUTIONS` (`@ptah-extension/shared`). This spec
 * lives here because this library builds the real tool list and already reads
 * repository files (`lane-policy-sync.spec.ts`).
 *
 *  (a) every `ptah_*` tool that a rendered text names is in the tool list, and
 *      the namespace of each row matches the list builder;
 *  (d) no consumer source file carries a hand-written substitution table.
 *
 * Rules (b) and (c) are in the shared library spec, the lane policy spec
 * (`cli-adapter.utils.spec.ts`), the core prompt spec and the server
 * instructions spec.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { PTAH_LANE_POLICY } from '@ptah-extension/cli-agent-runtime';
import { PTAH_CORE_SYSTEM_PROMPT } from '@ptah-extension/agent-sdk';
import {
  TOOL_SUBSTITUTIONS,
  AGENT_TOOLING_RULES_MAX_BYTES,
  renderAgentToolingRules,
  renderCoreSubstitutionBlock,
  renderLaneToolTable,
  toolDescriptionCue,
} from '@ptah-extension/shared';
import { buildToolDefinitions } from './mcp-core/effective-tool-list';
import { buildServerInstructions } from './mcp-core/server-instructions';

const TOOL_TOKEN = /\bptah_[a-z][a-z0-9]*(?:_[a-z0-9]+)*/g;
/** Namespaces `buildToolDefinitions` can switch off. */
const SWITCHABLE_NAMESPACES = [
  'ide',
  'agent',
  'git',
  'json',
  'browser',
  'harness',
  'code',
];

function listed(deps: Parameters<typeof buildToolDefinitions>[0]): Set<string> {
  return new Set(buildToolDefinitions(deps).map((tool) => tool.name));
}

/** Names with a wildcard (`ptah_session_*`) are families, not tool names. */
const TOOL_FAMILY = /\bptah_[a-z0-9_]*\*/g;

function toolTokens(text: string): string[] {
  return [...new Set(text.replace(TOOL_FAMILY, '').match(TOOL_TOKEN) ?? [])];
}

function findRepoRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(dir, 'nx.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not locate the Nx workspace root from ' + __dirname);
}

const REPO_ROOT = findRepoRoot();
const ALL_TOOLS = listed({ hasIDECapabilities: true });

describe('(a) every tool a rendered text names is in the effective tool list', () => {
  const renderings: ReadonlyArray<[string, string]> = [
    ['core prompt', PTAH_CORE_SYSTEM_PROMPT],
    ['core substitution block', renderCoreSubstitutionBlock()],
    ['lane policy', PTAH_LANE_POLICY],
    ['lane table', renderLaneToolTable()],
    ['agent file working rules', renderAgentToolingRules()],
    ['server instructions', buildServerInstructions()],
    [
      'agent-lanes skill',
      fs.readFileSync(
        path.join(REPO_ROOT, '.claude/skills/agent-lanes/SKILL.md'),
        'utf8',
      ),
    ],
    [
      'tool descriptions',
      buildToolDefinitions({ hasIDECapabilities: true })
        .map((tool) => tool.description)
        .join('\n'),
    ],
  ];

  it.each(renderings)('%s names only listed tools', (_name, text) => {
    const unknown = toolTokens(text).filter((name) => !ALL_TOOLS.has(name));
    expect(unknown).toEqual([]);
  });

  it('finds the tokens it is meant to find', () => {
    expect(toolTokens('use ptah_grep, not ptah_nope_tool.')).toEqual([
      'ptah_grep',
      'ptah_nope_tool',
    ]);
    expect(toolTokens('search for "ptah_", ptah_* or ptah_session_*')).toEqual([]);
  });

  it.each(TOOL_SUBSTITUTIONS.map((row) => [row.tool, row] as const))(
    '%s: the row namespace matches the list builder',
    (tool, row) => {
      expect(ALL_TOOLS.has(tool)).toBe(true);
      const others = (keep: string) =>
        SWITCHABLE_NAMESPACES.filter((namespace) => namespace !== keep);

      if (row.namespace === 'core') {
        // Listed even when every switchable namespace is off.
        expect(
          listed({
            hasIDECapabilities: false,
            disabledMcpNamespaces: SWITCHABLE_NAMESPACES,
          }).has(tool),
        ).toBe(true);
        return;
      }
      expect(
        listed({ hasIDECapabilities: true, disabledMcpNamespaces: [row.namespace] }).has(tool),
      ).toBe(false);
      expect(
        listed({
          hasIDECapabilities: true,
          disabledMcpNamespaces: others(row.namespace),
        }).has(tool),
      ).toBe(true);
      if (row.namespace === 'ide') {
        expect(listed({ hasIDECapabilities: false }).has(tool)).toBe(false);
      }
    },
  );

  it('keeps the agent file working rules within their byte budget', () => {
    expect(
      Buffer.byteLength(renderAgentToolingRules(), 'utf8'),
    ).toBeLessThanOrEqual(AGENT_TOOLING_RULES_MAX_BYTES);
  });

  it('does not present ptah_workspace_analyze as the first step of every task', () => {
    const description =
      buildToolDefinitions({ hasIDECapabilities: true }).find(
        (tool) => tool.name === 'ptah_workspace_analyze',
      )?.description ?? '';
    expect(description).not.toMatch(/\bFIRST\b/);
    expect(description).toContain('broad overview');
  });

  it('puts the cue of every row that has one in that tool description', () => {
    const definitions = buildToolDefinitions({ hasIDECapabilities: true });
    for (const row of TOOL_SUBSTITUTIONS.filter((r) => r.cue)) {
      const cue = toolDescriptionCue(row.tool);
      expect(cue).toBeDefined();
      const definition = definitions.find((tool) => tool.name === row.tool);
      expect(definition?.description.startsWith(cue as string)).toBe(true);
    }
  });
});

/** Lines that put a source tool in a table cell or in the second column. */
function tableLinesFor(text: string, tools: readonly string[]): string[] {
  const cell = new RegExp(`\\|\\s*(?:${tools.join('|')})\\b`);
  return text.split(/\r?\n/).filter((line) => cell.test(line));
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : sourceFiles(full);
    }
    return /\.ts$/.test(entry.name) && !/\.spec\.ts$/.test(entry.name)
      ? [full]
      : [];
  });
}

describe('(d) no hand-written substitution table in a consumer', () => {
  const tools = TOOL_SUBSTITUTIONS.map((row) => row.tool);
  const libs = [
    'agent-sdk',
    'cli-agent-runtime',
    'vscode-lm-tools',
    'agent-generation',
  ];

  it('detects a core-style and a lane-style table', () => {
    const core = '| Bash `find` | ptah_search_files | Respects .gitignore |';
    const lane = 'Find files by path   | ptah_search_files';
    expect(tableLinesFor(`${core}\n${lane}`, tools)).toHaveLength(2);
    expect(tableLinesFor('Call ptah_grep for text.', tools)).toHaveLength(0);
  });

  it.each(libs)('%s source has no table row that pairs a need with a tool', (lib) => {
    const root = path.join(REPO_ROOT, 'libs/backend', lib, 'src');
    const offenders = sourceFiles(root)
      .map((file) => ({
        file: path.relative(REPO_ROOT, file),
        lines: tableLinesFor(fs.readFileSync(file, 'utf8'), tools),
      }))
      // One stray line can be prose; a table has at least two rows.
      .filter((entry) => entry.lines.length >= 2);
    expect(offenders).toEqual([]);
  });

  it('keeps the core table header row out of every consumer', () => {
    for (const lib of libs) {
      for (const file of sourceFiles(path.join(REPO_ROOT, 'libs/backend', lib, 'src'))) {
        expect(fs.readFileSync(file, 'utf8')).not.toMatch(
          /\|\s*Instead of\.\.\.\s*\|\s*CALL THIS TOOL/,
        );
      }
    }
  });
});
