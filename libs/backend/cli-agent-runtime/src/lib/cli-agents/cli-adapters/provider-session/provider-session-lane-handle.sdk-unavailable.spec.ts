/**
 * The lane when the ACP client library cannot load (m-1 of the P1 review):
 * `done` resolves 1, the lane writes one `[Agent] ...` output line and one
 * error segment, and the agent is stopped. Its own file: the SDK module mock
 * below would break every other lane spec.
 */
jest.mock('@agentclientprotocol/sdk', () => {
  throw new Error('Cannot find module');
});

import type { CliOutputSegment } from '@ptah-extension/shared';
import {
  createFakeAcpAgent,
  createFakeAcpTransport,
} from '@ptah-extension/acp-runtime/testing';
import { createProviderSessionLaneHandle } from './provider-session-lane-handle';

describe('createProviderSessionLaneHandle — SDK unavailable', () => {
  it('ends the first turn with one error and stops the agent', async () => {
    const agent = createFakeAcpAgent();
    const transport = createFakeAcpTransport(agent);
    const handle = createProviderSessionLaneHandle({
      profile: {
        vendor: 'grok',
        displayName: 'Test Agent',
        signInHint: 'run `test login`',
        buildSpawn: () => ({ args: [] }),
        buildMcpServers: () => [],
      },
      options: { task: 't', workingDirectory: process.cwd() },
      command: 'test-agent',
      transportFactory: () => transport,
    });
    const segments: CliOutputSegment[] = [];
    const output: string[] = [];
    handle.onSegment?.((item) => segments.push(item));
    handle.onOutput((chunk) => output.push(chunk));

    await expect(handle.done).resolves.toBe(1);
    const errors = segments.filter((item) => item.type === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].content).toContain(
      'The ACP client library could not be loaded: Cannot find module',
    );
    expect(output.join('')).toContain(
      '[Test Agent] The ACP client library could not be loaded',
    );
    expect(transport.killCount).toBe(1);
    await agent.close();
  });
});
