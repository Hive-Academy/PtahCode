/**
 * Drift guards on the tool substitution source (rules b and c of the
 * single-source task): a row cannot vanish from a rendering without a recorded
 * reason, and a rendering cannot name a tool its row does not carry.
 */
import {
  TOOL_SUBSTITUTIONS,
  LANE_POLICY_MAX_BYTES,
  SERVER_INSTRUCTIONS_MAX_CHARS,
  AGENT_TOOLING_RULES_MAX_BYTES,
} from './tool-substitutions';
import {
  applyAgentToolingRules,
  renderAgentToolingRules,
  renderCoreSubstitutionBlock,
  renderLaneToolTable,
  toolDescriptionCue,
  withToolCue,
} from './tool-guidance.render';

const MIN_REASON_LENGTH = 10;

describe('TOOL_SUBSTITUTIONS (the rows)', () => {
  it('has one row per tool', () => {
    const tools = TOOL_SUBSTITUTIONS.map((row) => row.tool);
    expect(new Set(tools).size).toBe(tools.length);
  });

  it.each(TOOL_SUBSTITUTIONS.map((row) => [row.tool, row] as const))(
    '%s has a wording or a recorded reason for each rendering',
    (_tool, row) => {
      for (const rendering of ['core', 'lane'] as const) {
        const reason = row.omit?.[rendering];
        if (row[rendering]) {
          // A reason beside a wording would hide a row that is in fact present.
          expect(reason).toBeUndefined();
        } else {
          expect(reason?.length ?? 0).toBeGreaterThanOrEqual(MIN_REASON_LENGTH);
        }
      }
    },
  );

  it.each(TOOL_SUBSTITUTIONS.map((row) => [row.tool, row] as const))(
    '%s names its own tool in each wording',
    (tool, row) => {
      if (row.core) expect(row.core.call.split(/[\s{]/)[0]).toBe(tool);
      if (row.lane) expect(row.lane.prefer.startsWith(tool)).toBe(true);
    },
  );

  it('never lets a priority 1 row drop out of a rendering', () => {
    for (const row of TOOL_SUBSTITUTIONS.filter((r) => r.priority === 1)) {
      expect(row.omit).toBeUndefined();
      expect(row.core).toBeDefined();
      expect(row.lane).toBeDefined();
    }
  });

  it('gives each lane row a unique position', () => {
    const orders = TOOL_SUBSTITUTIONS.flatMap((row) =>
      row.lane ? [row.lane.order] : [],
    );
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('records the shell commands for every row that has a cue', () => {
    for (const row of TOOL_SUBSTITUTIONS.filter((r) => r.cue)) {
      expect(row.shell?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('renderCoreSubstitutionBlock', () => {
  const block = renderCoreSubstitutionBlock();

  it('has one table with exactly the rows that carry a core wording', () => {
    const tableRows = block
      .split('\n')
      .filter((line) => line.startsWith('| ') && !line.startsWith('| Instead'));
    const expected = TOOL_SUBSTITUTIONS.filter((row) => row.core);
    expect(tableRows).toHaveLength(expected.length);
    for (const row of expected) {
      expect(block).toContain(`| ${row.core?.call} |`);
    }
    expect(block.split('| Instead of... | CALL THIS TOOL | Why |')).toHaveLength(
      2,
    );
  });

  it('pins the text of the rows that carry the substitution mandate', () => {
    expect(block).toContain(
      '| `grep` / `rg` | ptah_grep { pattern, path?, glob? } | Text and constants, grouped by file with the enclosing function; `includeIgnored` + scoped `path` reaches node_modules |',
    );
    expect(block).toContain(
      '| `sed -n` / `cat` | ptah_read_symbol { file, name } | One declaration, or a line range (startLine/endLine); numbered, bounded |',
    );
    expect(block).toContain(
      'Fall back to Bash, Grep or Glob only for **writes**, build/test/git, a ptah error, or one Grep after zero hits.',
    );
    expect(block).toContain(
      '> **Symbol and AST lookups are MANDATORY via ptah before Grep/Glob.**',
    );
  });

  it('derives the free-text line from the shell commands of its rows', () => {
    expect(block).toContain(
      'Free text and line ranges: ptah_grep and ptah_read_symbol, not shell grep, rg, sed -n or cat.',
    );
  });

  it('leaves out the rows of a disabled namespace and nothing else', () => {
    const without = renderCoreSubstitutionBlock({
      disabledNamespaces: ['code'],
    });
    expect(without).not.toContain('| ptah_code_search_symbols');
    expect(without).not.toContain('| ptah_ast_analyze');
    expect(without).toContain('| ptah_grep');
    expect(without).toContain('| ptah_lsp_references');
  });
});

describe('renderLaneToolTable', () => {
  const table = renderLaneToolTable();

  it('has a header and one line per row that carries a lane wording, in order', () => {
    const lines = table.split('\n');
    const rows = TOOL_SUBSTITUTIONS.flatMap((row) => (row.lane ? [row.lane] : []))
      .sort((a, b) => a.order - b.order);
    expect(lines).toHaveLength(rows.length + 1);
    expect(lines[0]).toMatch(/^Need\s+\| Prefer$/);
    rows.forEach((row, index) => {
      expect(lines[index + 1]).toMatch(
        new RegExp(`^${escapeRegExp(row.need)}\\s+\\| ${escapeRegExp(row.prefer)}$`),
      );
    });
  });

  it('aligns the separator of every line', () => {
    const columns = new Set(table.split('\n').map((line) => line.indexOf('|')));
    expect(columns.size).toBe(1);
  });

  it('fits well inside the lane policy byte budget', () => {
    expect(Buffer.byteLength(table, 'utf8')).toBeLessThan(LANE_POLICY_MAX_BYTES / 2);
  });
});

describe('toolDescriptionCue', () => {
  it('names the shell commands of the text search and the read tool', () => {
    expect(toolDescriptionCue('ptah_grep')).toBe('Use instead of shell grep or rg.');
    expect(toolDescriptionCue('ptah_read_symbol')).toBe(
      'Use instead of shell sed -n or cat.',
    );
  });

  it('has no cue for a row without one, and keeps cues short', () => {
    expect(toolDescriptionCue('ptah_search_files')).toBeUndefined();
    for (const row of TOOL_SUBSTITUTIONS) {
      expect(toolDescriptionCue(row.tool)?.length ?? 0).toBeLessThanOrEqual(80);
    }
  });

  it('leads a description with the cue, or leaves it as it is', () => {
    expect(withToolCue('ptah_grep', 'Search.')).toBe(
      'Use instead of shell grep or rg. Search.',
    );
    expect(withToolCue('ptah_search_files', 'Find.')).toBe('Find.');
  });

  it('throws for a tool that has no row', () => {
    expect(() => toolDescriptionCue('ptah_nope')).toThrow(/ptah_nope/);
  });
});

describe('renderAgentToolingRules', () => {
  const rules = renderAgentToolingRules();

  it('lists every row that has a core wording, once, and stays inside its budget', () => {
    for (const row of TOOL_SUBSTITUTIONS.filter((r) => r.core)) {
      expect(rules.split(`| ${row.core?.call} |`)).toHaveLength(2);
    }
    expect(Buffer.byteLength(rules, 'utf8')).toBeLessThanOrEqual(
      AGENT_TOOLING_RULES_MAX_BYTES,
    );
  });

  it('teaches the text search and read tools, not the native free-text search', () => {
    expect(rules).toContain(
      'Free text and line ranges: ptah_grep and ptah_read_symbol, not shell grep, rg, sed -n or cat.',
    );
    expect(rules).not.toMatch(/Native read\/search only for free-text/);
  });
});

describe('applyAgentToolingRules', () => {
  const stale = [
    '## Working rules',
    '',
    '- old text',
    '',
    '| Native step | Ptah tool |',
    '| --- | --- |',
    '| Grep/Glob for function | ptah_code_search_symbols |',
    '',
    '## Skill use',
    '',
    '- keep me',
    '',
  ].join('\n');

  it('replaces the working rules and keeps the other sections', () => {
    const out = applyAgentToolingRules(stale);
    expect(out.startsWith(renderAgentToolingRules())).toBe(true);
    expect(out).not.toContain('old text');
    expect(out.endsWith('## Skill use\n\n- keep me\n')).toBe(true);
  });

  it('is idempotent', () => {
    const once = applyAgentToolingRules(stale);
    expect(applyAgentToolingRules(once)).toBe(once);
  });

  it('handles a block with only the working rules', () => {
    expect(applyAgentToolingRules('## Working rules\n\n- old\n')).toBe(
      renderAgentToolingRules(),
    );
  });

  it('matches only a line that is exactly the heading', () => {
    const text = '### Working rules\n\nA mention of ## Working rules in prose.\n';
    expect(applyAgentToolingRules(text)).toBe(text);
  });

  it('keeps the rest of a block that uses CRLF line ends', () => {
    const out = applyAgentToolingRules(
      '## Working rules\r\n\r\n- old\r\n\r\n## Skill use\r\n\r\n- keep\r\n',
    );
    expect(out).not.toContain('- old');
    expect(out).toContain('## Skill use\r\n\r\n- keep');
  });

  it('ignores headings inside fenced code blocks', () => {
    const text = [
      '```md',
      '## Working rules',
      '```',
      '',
      '## Working rules',
      '',
      '- old',
      '',
      '```md',
      '## Not a section',
      '```',
      '',
      '## Skill use',
      '',
      '- keep',
      '',
    ].join('\n');
    const out = applyAgentToolingRules(text);
    expect(out.startsWith('```md\n## Working rules\n```\n\n')).toBe(true);
    expect(out).toContain(renderAgentToolingRules());
    expect(out).not.toContain('- old');
    expect(out).not.toContain('## Not a section');
    expect(out.endsWith('## Skill use\n\n- keep\n')).toBe(true);
  });

  it('returns a text without the heading unchanged', () => {
    expect(applyAgentToolingRules('## Other\n\ntext')).toBe('## Other\n\ntext');
  });
});

describe('limits', () => {
  it('keep the values the clients rely on', () => {
    expect(LANE_POLICY_MAX_BYTES).toBe(3500);
    expect(SERVER_INSTRUCTIONS_MAX_CHARS).toBe(512);
  });
});

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
