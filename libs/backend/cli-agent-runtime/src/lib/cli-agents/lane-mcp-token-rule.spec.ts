import { laneMcpTokenCapability } from './lane-mcp-token-rule';

describe('lane MCP token capability', () => {
  it.each(['codex', 'cursor', 'copilot', 'opencode', 'grok', 'antigravity'] as const)(
    'issues privileged for %s', (cli) => {
      expect(laneMcpTokenCapability(cli)).toBe('privileged');
    },
  );

  it('issues nothing for CLIs without a lane MCP credential', () => {
    expect(laneMcpTokenCapability('claude')).toBeNull();
  });
});
