import { readFileSync } from 'fs';
import { join } from 'path';

import { compilePtahUiBlock } from '../../mcp-apps-contracts/ptah-ui-pipeline';
import { parseContextOutput } from './context-output.parser';
import { renderContextPtahUi } from './context-output.render';
import { formatLocalCommandOutput } from './format-local-command-output';
import { parseTokens } from './local-command-text';
import { escapePtahUi } from './ptah-ui-writer';
import { parseUsageOutput } from './usage-output.parser';
import { renderUsagePtahUi } from './usage-output.render';

const fixture = (name: string): string =>
  readFileSync(join(__dirname, '__fixtures__', name), 'utf8');

const USAGE = fixture('usage.txt');
const CONTEXT = fixture('context.txt');

const FENCE = /^```ptah-ui\n([\s\S]*)```$/;

function bodyOf(markdown: string): string {
  const match = FENCE.exec(markdown);
  if (!match) throw new Error(`not a ptah-ui fence: ${markdown.slice(0, 40)}`);
  return match[1];
}

describe('parseTokens', () => {
  it.each([
    ['11.8k', 11_800],
    ['1m', 1_000_000],
    ['~140', 140],
    ['227', 227],
    ['921.5k', 921_500],
    ['18,780', 18_780],
  ])('parses %s', (text, value) => {
    expect(parseTokens(text)).toBe(value);
  });

  it('rejects non-numbers', () => {
    expect(parseTokens('lots')).toBeNull();
  });
});

describe('parseUsageOutput', () => {
  it('parses the limits, windows, contributors and top lists of the fixture', () => {
    const report = parseUsageOutput(USAGE);
    expect(report).not.toBeNull();
    if (!report) return;

    expect(report.limits).toEqual([
      {
        window: 'Current week',
        label: 'all models',
        pct: 3,
        reset: 'resets Dec 5, 5am (Africa/Cairo)',
      },
      {
        window: 'Current week',
        label: 'Fable',
        pct: 4,
        reset: 'resets Dec 5, 5am (Africa/Cairo)',
      },
    ]);
    expect(report.notes).toContain(
      'You are currently using your subscription to power your Claude Code usage',
    );
    expect(
      report.windows.map((w) => [w.title, w.requests, w.sessions]),
    ).toEqual([
      ['Last 24h', 427, 15],
      ['Last 7d', 18_780, 63],
    ]);

    const [day, week] = report.windows;
    expect(day.contributors[0]).toEqual({
      pct: 45,
      label: 'Run fewer sessions at once',
      hint: 'up to 5 at once',
    });
    expect(day.contributors[3]).toEqual({
      pct: 21,
      label: 'Run /session-handoff on a cheaper model',
      hint: null,
    });
    expect(day.contributors).toHaveLength(5);
    expect(day.tops.map((t) => t.kind)).toEqual(['skills', 'MCP servers']);
    expect(day.tops[0].items[0]).toEqual({ name: '/session-handoff', pct: 21 });

    const subagents = week.tops.find((t) => t.kind === 'subagents');
    expect(subagents?.items).toHaveLength(8);
    expect(subagents?.items[0]).toEqual({ name: 'backend-developer', pct: 40 });
    expect(subagents?.more).toBe(3);
  });

  it('returns null for text that is not a usage report', () => {
    expect(parseUsageOutput('Command completed successfully.')).toBeNull();
    expect(parseUsageOutput('')).toBeNull();
  });
});

describe('parseContextOutput', () => {
  it('parses the header, categories and per-section tables of the fixture', () => {
    const report = parseContextOutput(CONTEXT);
    expect(report).not.toBeNull();
    if (!report) return;

    expect(report.model).toBe('claude-fable-5-2');
    expect(report.used).toEqual({ value: 45_500, text: '45.5k' });
    expect(report.total).toEqual({ value: 1_000_000, text: '1m' });
    expect(report.usedPct).toBe(5);
    expect(report.categories).toHaveLength(12);
    expect(report.categories[0]).toEqual({
      name: 'System prompt',
      tokens: { value: 11_800, text: '11.8k' },
      pct: 1.2,
    });
    expect(
      report.categories.find((c) => c.name === 'Free space')?.tokens.value,
    ).toBe(921_500);
    expect(report.mcpTools).toHaveLength(7);
    expect(report.mcpTools[2]).toEqual({
      name: 'mcp__ptah__ptah_agent_spawn',
      source: 'ptah',
      tokens: { value: 3_400, text: '3.4k' },
    });
    expect(report.customAgents.map((a) => a.name)).toEqual([
      'backend-developer',
      'code-logic-reviewer',
      'software-architect',
    ]);
    expect(report.skills[0]).toEqual({
      name: 'agent-lanes',
      source: 'Project',
      tokens: { value: 140, text: '~140' },
    });
    expect(report.memoryFiles).toEqual([
      { type: 'User', tokens: { value: 332, text: '332' } },
      { type: 'Project', tokens: { value: 5_200, text: '5.2k' } },
    ]);
  });

  it('accepts the transcript form wrapped in <local-command-stdout> with trailing spaces', () => {
    const wrapped = `<local-command-stdout>${CONTEXT.replace(
      '**Model:** claude-fable-5-2',
      '**Model:** claude-fable-5-2  ',
    )}</local-command-stdout>`;
    expect(parseContextOutput(wrapped)?.model).toBe('claude-fable-5-2');
  });

  it('returns null without the Context Usage heading', () => {
    expect(parseContextOutput('| a | b |\n|---|---|\n| 1 | 2 |')).toBeNull();
  });
});

describe('formatLocalCommandOutput', () => {
  it.each([
    ['usage', USAGE],
    ['context', CONTEXT],
  ])(
    'turns the %s fixture into a ptah-ui block that compiles',
    (_name, text) => {
      const formatted = formatLocalCommandOutput(text);
      const body = bodyOf(formatted);
      const compiled = compilePtahUiBlock(body, 'local-command-test');
      expect(compiled.ok ? null : compiled.reason).toBeNull();
    },
  );

  it('puts excess weekly limits into a table and compiles all 51 limits', () => {
    const text = 'Current week: 4% used\n'.repeat(51);
    const body = bodyOf(formatLocalCommandOutput(text));
    expect(body.match(/^ {2}card /gm)).toHaveLength(4);
    expect(body.match(/^ {2}Current week \| 4% \| —$/gm)).toHaveLength(47);
    expect(compilePtahUiBlock(body, 'many-limits').ok).toBe(true);
  });

  it('returns raw usage when a chart percentage would use exponent notation', () => {
    const text =
      'Last 24h · 3 requests · 1 session\n  1000000000000000000000% Oversized';
    expect(formatLocalCommandOutput(text)).toBe(text);
  });

  it('never shows memory file paths', () => {
    const formatted = formatLocalCommandOutput(CONTEXT);
    expect(formatted).not.toContain('CLAUDE.md');
    expect(formatted).not.toContain('Users');
  });

  it('caps long tables with a "+N more" note', () => {
    const rows = Array.from(
      { length: 12 },
      (_v, i) => `| mcp__srv__tool_${i} | srv | ${i + 1}k |`,
    ).join('\n');
    const text = `## Context Usage\n\n**Tokens:** 20k / 200k (10%)\n\n### MCP Tools\n\n| Tool | Server | Tokens |\n|---|---|---|\n${rows}\n`;
    const body = bodyOf(formatLocalCommandOutput(text));
    expect(body).toContain('accordion MCP tools (12)');
    expect(body).toContain('note info +4 more');
    expect(body).toContain('tool_11 | srv | 12k');
    expect(compilePtahUiBlock(body, 'cap').ok).toBe(true);
  });

  it('escapes values that would otherwise change the block structure', () => {
    const text = `## Context Usage\n\n**Model:** a|b\\c $x\n**Tokens:** 1k / 2k (50%)\n`;
    const body = bodyOf(formatLocalCommandOutput(text));
    expect(body).toContain('Model | a\\|b\\\\c \\$x');
    expect(compilePtahUiBlock(body, 'escape').ok).toBe(true);
  });

  it('returns unrecognised text unchanged', () => {
    for (const text of [
      'Command completed successfully.',
      '(no content)',
      '',
      '   ',
      'Compacted (ctrl+o to see full summary)',
    ])
      expect(formatLocalCommandOutput(text)).toBe(text);
  });

  it.each([
    'Current week (all models): ',
    'Last 24h · ',
    '## Context Usage\n',
    '## Context Usage\n| Category | Tokens |\n|---|\n| x |',
    USAGE.slice(0, USAGE.length / 2),
    CONTEXT.slice(0, CONTEXT.length / 3),
    'Last 24h · 3 requests\n  12%',
  ])('does not throw on partial or malformed text (%#)', (text) => {
    expect(() => formatLocalCommandOutput(text)).not.toThrow();
    const formatted = formatLocalCommandOutput(text);
    if (formatted !== text)
      expect(compilePtahUiBlock(bodyOf(formatted), 'partial').ok).toBe(true);
  });

  it('renders a usage report with no displayable data as null', () => {
    expect(
      renderUsagePtahUi({
        kind: 'usage',
        notes: [],
        limits: [],
        windows: [
          {
            title: 'Last 24h',
            requests: null,
            sessions: null,
            contributors: [],
            tops: [],
          },
        ],
      }),
    ).toBeNull();
  });

  it.each([
    'Last 24h',
    'Last updated: Dec 5, 2026',
    'Release notes\nLast updated: Dec 5\n  45% faster builds\n  Top skills: a 5%',
    'Last week · 3 apples',
    '# Heading\n\n- item one\n- item two\n\n**Last** time we met: 10% off',
    'Current status: 40% done',
    'Current capacity: 20% used',
    'Last 24h · 3 requests',
  ])('does not treat non-usage text as a usage report (%#)', (text) => {
    expect(parseUsageOutput(text)).toBeNull();
    expect(formatLocalCommandOutput(text)).toBe(text);
  });

  it('renders a context report without data as null', () => {
    const report = parseContextOutput(
      '## Context Usage\n**Tokens:** 1k / 2k\n',
    );
    expect(report).not.toBeNull();
    expect(renderContextPtahUi(report!)).not.toBeNull();
  });
});

describe('escapePtahUi', () => {
  it('escapes pipes, backslashes and dollars and drops control characters', () => {
    expect(escapePtahUi('a|b\\c$d\u0007e')).toBe('a\\|b\\\\c\\$d e');
  });

  it('shortens long values', () => {
    expect([...escapePtahUi('x'.repeat(200), 10)]).toHaveLength(10);
  });
});
