import { readdirSync } from 'fs';
import * as path from 'path';
import { isRetiredRole } from '@ptah-extension/shared';
import {
  PTAH_BROWSER_TOOLS,
  SUBAGENT_DISALLOWED_TOOLS,
  WEB_SCRAPE_SERVERS,
  WEB_SEARCH_TOOLS,
  formatDisallowedToolsFrontmatter,
  getSubagentDisallowedTools,
} from './subagent-tool-allowlist';

const BROWSER = [
  'mcp__ptah__ptah_browser_navigate',
  'mcp__ptah__ptah_browser_screenshot',
  'mcp__ptah__ptah_browser_evaluate',
  'mcp__ptah__ptah_browser_click',
  'mcp__ptah__ptah_browser_type',
  'mcp__ptah__ptah_browser_content',
  'mcp__ptah__ptah_browser_network',
  'mcp__ptah__ptah_browser_close',
  'mcp__ptah__ptah_browser_status',
  'mcp__ptah__ptah_browser_record_start',
  'mcp__ptah__ptah_browser_record_stop',
];
const NO_BROWSER_NO_WEB = [
  'mcp__firecrawl',
  'mcp__ptah__ptah_web_search',
  ...BROWSER,
];

describe('subagent tool allowlist (N3)', () => {
  it('names every Ptah browser tool in full and the web servers/tools', () => {
    expect(PTAH_BROWSER_TOOLS).toEqual(BROWSER);
    expect(WEB_SCRAPE_SERVERS).toEqual(['mcp__firecrawl']);
    expect(WEB_SEARCH_TOOLS).toEqual(['mcp__ptah__ptah_web_search']);
  });

  it.each([
    ['team-leader', NO_BROWSER_NO_WEB],
  ])('%s denies exactly its row', (agentType, expected) => {
    expect(getSubagentDisallowedTools(agentType)).toEqual(expected);
  });

  it('has a row for every shipped agent template and no other', () => {
    const templateDir = path.resolve(__dirname, '../../../templates/agents');
    const templateNames = readdirSync(templateDir)
      .filter((file) => file.endsWith('.template.md'))
      .map((file) => file.replace(/\.template\.md$/, ''))
      .filter((name) => !isRetiredRole(name))
      .sort();
    expect(Object.keys(SUBAGENT_DISALLOWED_TOOLS).sort()).toEqual(
      templateNames,
    );
    expect(templateNames).toHaveLength(1);
  });

  it('never uses a form the runtime ignores (bare * or a partial wildcard)', () => {
    for (const tools of Object.values(SUBAGENT_DISALLOWED_TOOLS)) {
      for (const tool of tools) {
        expect(tool).not.toContain('*');
        expect(tool).not.toMatch(/[\s,]/);
      }
    }
  });

  it('gives an unknown or inherited-property type no restriction', () => {
    expect(getSubagentDisallowedTools('my-custom-agent')).toEqual([]);
    expect(getSubagentDisallowedTools('toString')).toEqual([]);
    expect(getSubagentDisallowedTools('')).toEqual([]);
  });

  it('formats one comma-separated frontmatter line', () => {
    expect(formatDisallowedToolsFrontmatter('team-leader')).toBe(
      `disallowedTools: ${NO_BROWSER_NO_WEB.join(', ')}`,
    );
  });

  it('formats nothing for a type that keeps every tool', () => {
    expect(formatDisallowedToolsFrontmatter('visual-reviewer')).toBeUndefined();
    expect(formatDisallowedToolsFrontmatter('my-custom-agent')).toBeUndefined();
  });
});

// Phase C regression (decision #20): the remaining NO_BROWSER_NO_WEB roles keep their
// exact deny set. Literal on purpose, so a shortening attempt fails loudly.
const NO_BROWSER_NO_WEB_ROLES = [
  'team-leader',
];
const PINNED_DENY_SET_LITERAL = [
  'mcp__firecrawl',
  'mcp__ptah__ptah_web_search',
  'mcp__ptah__ptah_browser_navigate',
  'mcp__ptah__ptah_browser_screenshot',
  'mcp__ptah__ptah_browser_evaluate',
  'mcp__ptah__ptah_browser_click',
  'mcp__ptah__ptah_browser_type',
  'mcp__ptah__ptah_browser_content',
  'mcp__ptah__ptah_browser_network',
  'mcp__ptah__ptah_browser_close',
  'mcp__ptah__ptah_browser_status',
  'mcp__ptah__ptah_browser_record_start',
  'mcp__ptah__ptah_browser_record_stop',
];
const PINNED_FRONTMATTER_LITERAL =
  'disallowedTools: mcp__firecrawl, mcp__ptah__ptah_web_search, mcp__ptah__ptah_browser_navigate, mcp__ptah__ptah_browser_screenshot, mcp__ptah__ptah_browser_evaluate, mcp__ptah__ptah_browser_click, mcp__ptah__ptah_browser_type, mcp__ptah__ptah_browser_content, mcp__ptah__ptah_browser_network, mcp__ptah__ptah_browser_close, mcp__ptah__ptah_browser_status, mcp__ptah__ptah_browser_record_start, mcp__ptah__ptah_browser_record_stop';

describe('least-privilege effective set (Phase C, decision #20)', () => {
  it('pins exactly 13 literal names for the deny set', () => {
    expect(PINNED_DENY_SET_LITERAL).toHaveLength(13);
  });

  it.each(NO_BROWSER_NO_WEB_ROLES)(
    '%s denies exactly the 13 pinned names in order',
    (role) => {
      const tools = getSubagentDisallowedTools(role);
      expect(tools).toHaveLength(13);
      expect([...tools]).toEqual(PINNED_DENY_SET_LITERAL);
    },
  );

  it.each(NO_BROWSER_NO_WEB_ROLES)(
    '%s renders the literal unchanged frontmatter line',
    (role) => {
      expect(formatDisallowedToolsFrontmatter(role)).toBe(
        PINNED_FRONTMATTER_LITERAL,
      );
    },
  );

  it('keeps retired roles out of the active policy', () => {
    const others = Object.keys(SUBAGENT_DISALLOWED_TOOLS).filter(
      (role) => !NO_BROWSER_NO_WEB_ROLES.includes(role),
    );
    expect(others).toHaveLength(0);
    for (const role of others) {
      expect(getSubagentDisallowedTools(role).length).toBeLessThanOrEqual(1);
    }
    expect(formatDisallowedToolsFrontmatter('technical-content-writer')).toBeUndefined();
    expect(formatDisallowedToolsFrontmatter('visual-reviewer')).toBeUndefined();
  });
});
