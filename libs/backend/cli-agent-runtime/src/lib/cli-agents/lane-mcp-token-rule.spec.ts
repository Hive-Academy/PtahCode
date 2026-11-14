import { laneMcpTokenCapability } from './lane-mcp-token-rule';

describe('lane MCP token capability', () => {
  it.each(['codex', 'cursor', 'copilot', 'opencode', 'grok'] as const)(
    'issues privileged for %s', (cli) => {
      expect(laneMcpTokenCapability(cli)).toBe('privileged');
    },
  );

  it('issues lane-report for antigravity and nothing for other CLIs', () => {
    expect(laneMcpTokenCapability('antigravity')).toBe('lane-report');
    expect(laneMcpTokenCapability('claude')).toBeNull();
  });
});
