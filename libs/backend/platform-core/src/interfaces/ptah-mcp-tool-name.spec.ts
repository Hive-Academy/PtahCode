import {
  PTAH_MCP_TOOL_PREFIX,
  hasPtahMcpToolPrefix,
  stripPtahMcpToolPrefix,
  withPtahMcpToolPrefix,
} from './ptah-mcp-tool-name';

describe('ptah MCP tool name prefix', () => {
  it('is the name Claude gives tools of the ptah server', () => {
    expect(PTAH_MCP_TOOL_PREFIX).toBe('mcp__ptah__');
  });

  it('detects the prefix', () => {
    expect(hasPtahMcpToolPrefix('mcp__ptah__ptah_agent_spawn')).toBe(true);
    expect(hasPtahMcpToolPrefix('ptah_agent_spawn')).toBe(false);
    expect(hasPtahMcpToolPrefix('mcp__other__tool')).toBe(false);
  });

  it('strips the prefix once and leaves other names unchanged', () => {
    expect(stripPtahMcpToolPrefix('mcp__ptah__github__create_issue')).toBe(
      'github__create_issue',
    );
    expect(stripPtahMcpToolPrefix('ptah_grep')).toBe('ptah_grep');
    expect(stripPtahMcpToolPrefix('mcp__ptah__mcp__ptah__x')).toBe(
      'mcp__ptah__x',
    );
  });

  it('adds the prefix without doubling it', () => {
    expect(withPtahMcpToolPrefix('ptah_cron_create')).toBe(
      'mcp__ptah__ptah_cron_create',
    );
    expect(withPtahMcpToolPrefix('mcp__ptah__ptah_cron_create')).toBe(
      'mcp__ptah__ptah_cron_create',
    );
  });

  it('round-trips', () => {
    expect(stripPtahMcpToolPrefix(withPtahMcpToolPrefix('ptah_grep'))).toBe(
      'ptah_grep',
    );
  });
});
