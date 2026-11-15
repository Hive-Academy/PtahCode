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

describe('subagent tool allowlist (N3)', () => {
  it('names every Ptah browser tool in full and the web servers/tools', () => {
    expect(PTAH_BROWSER_TOOLS).toEqual(BROWSER);
    expect(WEB_SCRAPE_SERVERS).toEqual(['mcp__firecrawl']);
    expect(WEB_SEARCH_TOOLS).toEqual(['mcp__ptah__ptah_web_search']);
  });

  it('has no built-in policy rows', () => {
    expect(SUBAGENT_DISALLOWED_TOOLS).toEqual({});
    expect(getSubagentDisallowedTools('team-leader')).toEqual([]);
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
    expect(templateNames).toHaveLength(0);
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

  it('formats no retired-role frontmatter line', () => {
    expect(formatDisallowedToolsFrontmatter('team-leader')).toBeUndefined();
  });

  it('formats nothing for a type that keeps every tool', () => {
    expect(formatDisallowedToolsFrontmatter('visual-reviewer')).toBeUndefined();
    expect(formatDisallowedToolsFrontmatter('my-custom-agent')).toBeUndefined();
  });
});

// A future restricted built-in must retain its exact deny set.
const NO_BROWSER_NO_WEB_ROLES: string[] = [];
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

  (NO_BROWSER_NO_WEB_ROLES.length > 0
    ? it.each(NO_BROWSER_NO_WEB_ROLES)
    : it.skip.each(['no restricted built-in']))(
    '%s denies exactly the 13 pinned names in order',
    (role) => {
      const tools = getSubagentDisallowedTools(role);
      expect(tools).toHaveLength(13);
      expect([...tools]).toEqual(PINNED_DENY_SET_LITERAL);
    },
  );

  (NO_BROWSER_NO_WEB_ROLES.length > 0
    ? it.each(NO_BROWSER_NO_WEB_ROLES)
    : it.skip.each(['no restricted built-in']))(
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
    expect(
      formatDisallowedToolsFrontmatter('technical-content-writer'),
    ).toBeUndefined();
    expect(formatDisallowedToolsFrontmatter('visual-reviewer')).toBeUndefined();
  });
});
