import type { IMcpCallerCredentials } from '@ptah-extension/platform-core';
import type { Logger } from '@ptah-extension/vscode-core';
import {
  issueLaneMcpToken,
  laneMcpAuthUrl,
  laneToolProfileAdapterResult,
  LANE_MCP_TTL_MS,
} from './lane-mcp-credentials';

describe('issueLaneMcpToken', () => {
  const token = 'a'.repeat(43);
  const logger = { warn: jest.fn() } as Pick<Logger, 'warn'> as Logger;

  it('binds a four-hour privileged token to the agent and workspace', () => {
    const issue = jest.fn().mockReturnValue(token);
    const credentials = {
      issue,
      revokeSubject: jest.fn(),
    } satisfies IMcpCallerCredentials;
    expect(issueLaneMcpToken(credentials, logger, 'lane-1', '/work')).toBe(
      token,
    );
    expect(issue).toHaveBeenCalledWith(
      {
        kind: 'agent',
        agentId: 'lane-1',
        workspaceRoot: '/work',
        capability: 'privileged',
      },
      'lane-1',
      LANE_MCP_TTL_MS,
    );
  });

  it('binds a four-hour lane-report token to the agent and workspace', () => {
    const issue = jest.fn().mockReturnValue(token);
    const credentials = {
      issue,
      revokeSubject: jest.fn(),
    } satisfies IMcpCallerCredentials;
    expect(
      issueLaneMcpToken(credentials, logger, 'agy-1', '/work', 'lane-report'),
    ).toBe(token);
    expect(issue).toHaveBeenCalledWith(
      {
        kind: 'agent',
        agentId: 'agy-1',
        workspaceRoot: '/work',
        capability: 'lane-report',
      },
      'agy-1',
      LANE_MCP_TTL_MS,
    );
  });

  it('omits the server when issuance fails', () => {
    const credentials = {
      issue: jest.fn(() => {
        throw new Error('secret-bearing failure');
      }),
      revokeSubject: jest.fn(),
    } satisfies IMcpCallerCredentials;
    expect(
      issueLaneMcpToken(credentials, logger, 'lane-1', '/work'),
    ).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      '[Lane MCP] Credential issuance failed; omitting ptah MCP server',
    );
  });
});

describe('issueLaneMcpToken phase profile', () => {
  const token = 'b'.repeat(43);
  const logger = { warn: jest.fn() } as Pick<Logger, 'warn'> as Logger;

  it('copies phase kind and denials onto the binding', () => {
    const issue = jest.fn().mockReturnValue(token);
    const credentials = {
      issue,
      revokeSubject: jest.fn(),
    } satisfies IMcpCallerCredentials;
    issueLaneMcpToken(credentials, logger, 'lane-1', '/work', 'privileged', {
      kind: 'implement',
      toolProfile: {
        disallowedTools: ['ptah_task_create'],
        permission: 'allow',
      },
    });
    expect(issue).toHaveBeenCalledWith(
      {
        kind: 'agent',
        agentId: 'lane-1',
        workspaceRoot: '/work',
        capability: 'privileged',
        phaseKind: 'implement',
        disallowedTools: ['ptah_task_create'],
      },
      'lane-1',
      LANE_MCP_TTL_MS,
    );
  });

  it('accepts a kind and denial list without the rest of the phase handoff', () => {
    const issue = jest.fn().mockReturnValue(token);
    const credentials = {
      issue,
      revokeSubject: jest.fn(),
    } satisfies IMcpCallerCredentials;
    issueLaneMcpToken(credentials, logger, 'lane-1', '/work', 'privileged', {
      kind: 'review',
      disallowedTools: ['ptah_browser_navigate'],
    });
    expect(issue.mock.calls[0]?.[0]).toMatchObject({
      phaseKind: 'review',
      disallowedTools: ['ptah_browser_navigate'],
    });
  });
});

describe('laneToolProfileAdapterResult', () => {
  const phase = (disallowedTools: readonly string[]) => ({
    toolProfile: { disallowedTools },
  });

  it('records filtered only for claude and unfiltered for the other executors', () => {
    const denied = phase(['ptah_task_create']);
    expect(laneToolProfileAdapterResult('claude', denied)).toEqual({
      executorId: 'claude',
      toolProfileStatus: 'filtered',
    });
    for (const executorId of [
      'codex',
      'grok',
      'antigravity',
      'copilot',
      'cursor',
      'opencode',
      'pi',
      'ptah-cli',
    ]) {
      expect(laneToolProfileAdapterResult(executorId, denied)).toEqual({
        executorId,
        toolProfileStatus: 'unfiltered',
      });
    }
  });

  it('records nothing when the phase is missing or its denial list is empty', () => {
    expect(laneToolProfileAdapterResult('claude', undefined)).toBeUndefined();
    expect(laneToolProfileAdapterResult('codex', phase([]))).toBeUndefined();
    expect(
      laneToolProfileAdapterResult('claude', phase(['', '  '])),
    ).toBeUndefined();
  });
});

describe('laneMcpAuthUrl', () => {
  it('puts the credential after the origin and before the agent route', () => {
    expect(
      laneMcpAuthUrl(
        'http://localhost:51820/agent/agent-7/workspace/%2Fproj',
        'lane-token',
      ),
    ).toBe(
      'http://localhost:51820/auth/lane-token/agent/agent-7/workspace/%2Fproj',
    );
  });
});
