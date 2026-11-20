/**
 * The Ptah MCP attachment a provider-session lane builds, and the ACP entry
 * the Grok profile makes of it. The three cases (and their expected entries)
 * are the former `grokAcpProfile.buildMcpServers` cases: the URL and bearer
 * moved to the lane, the entry shape stayed in the profile.
 */
import { grokAcpProfile } from '@ptah-extension/acp-runtime';
import type { CliCommandOptions } from '../cli-adapter.interface';
import { buildLaneMcpAttachments } from './lane-mcp-attachments';

const BASE_OPTIONS: CliCommandOptions = {
  task: 'Summarise the repository',
  workingDirectory: 'D:\\work\\repo',
};

/** What the Grok lane sends in `session/new.mcpServers` for these options. */
function grokMcpServers(options: CliCommandOptions) {
  return grokAcpProfile.buildMcpServers({
    ...options,
    mcp: buildLaneMcpAttachments(options),
  });
}

describe('buildLaneMcpAttachments', () => {
  it('attaches the scoped Ptah http entry when mcpPort is set', () => {
    expect(
      grokMcpServers({
        ...BASE_OPTIONS,
        mcpPort: 51820,
        agentId: 'agent-7',
        mcpToken: 'lane-token',
      }),
    ).toEqual([
      {
        type: 'http',
        name: 'ptah',
        url: `http://localhost:51820/agent/agent-7/workspace/${encodeURIComponent('D:\\work\\repo')}`,
        headers: [{ name: 'Authorization', value: 'Bearer lane-token' }],
      },
    ]);
  });

  it('attaches nothing when mcpPort is unset', () => {
    expect(grokMcpServers(BASE_OPTIONS)).toEqual([]);
    expect(buildLaneMcpAttachments(BASE_OPTIONS)).toEqual([]);
  });

  it('omits ptah when the lane credential is unavailable', () => {
    expect(grokMcpServers({ ...BASE_OPTIONS, mcpPort: 51820 })).toEqual([]);
  });
});
