import 'reflect-metadata';
import type { ProviderApprovalSink } from '@ptah-extension/provider-session-contracts';
import { SessionId, type CliDetectionResult } from '@ptah-extension/shared';
import { createProviderSessionOpenRequests } from './provider-session-open-request';

jest.mock('@ptah-extension/agent-sdk', () => ({
  PTAH_MCP_PORT: 51820,
  ProviderSessionChatAdapterError: jest.requireActual<
    typeof import('../../../../../agent-sdk/src/lib/provider-session/provider-session-chat-adapter-error')
  >('../../../../../agent-sdk/src/lib/provider-session/provider-session-chat-adapter-error')
    .ProviderSessionChatAdapterError,
}));

const sessionId = SessionId.from('22222222-2222-4222-8222-222222222222');
const token = 't'.repeat(43);

function harness(detection?: Partial<CliDetectionResult>) {
  const getDetection = jest.fn(async () =>
    detection === undefined
      ? ({
          cli: 'grok',
          installed: true,
          path: '/bin/grok',
          messagingMode: 'none',
        } as unknown as CliDetectionResult)
      : (detection as CliDetectionResult),
  );
  let running = true;
  const logger = { debug: jest.fn(), info: jest.fn() };
  const readSavedPermissionLevel = jest.fn(() => 'auto-edit' as const);
  const requests = createProviderSessionOpenRequests({
    cliDetection: { getDetection },
    readSavedPermissionLevel,
    mcpServerRunning: () => running,
    baseEnv: () => ({ PATH: '/bin' }),
    logger,
  });
  return {
    requests,
    getDetection,
    logger,
    readSavedPermissionLevel,
    stopMcp: () => (running = false),
  };
}

const input = {
  sessionId,
  profile: 'grok' as const,
  workspacePath: '/workspace',
  nativeSessionId: 'native-1',
  model: 'grok-4',
};

describe('provider-session open requests', () => {
  it('builds the runtime request with binary, saved policy and Ptah MCP', async () => {
    const h = harness();
    const request = h.requests.request(input);
    // Nothing is resolved until the pool opens a process (N-3).
    expect(h.getDetection).not.toHaveBeenCalled();
    expect(h.readSavedPermissionLevel).not.toHaveBeenCalled();
    expect(request).toMatchObject({
      profile: 'grok',
      workspaceRoot: '/workspace',
      nativeSessionId: 'native-1',
    });
    const attach = {
      nativeSessionId: 'native-1',
      method: 'load' as const,
      onFailure: 'error' as const,
    };
    const open = await request.build({ mcpToken: token, attach });
    expect(h.getDetection).toHaveBeenCalledWith('grok');
    expect(h.readSavedPermissionLevel).toHaveBeenCalledWith('/workspace');
    expect(open).toMatchObject({
      profile: 'grok',
      binaryPath: '/bin/grok',
      policy: { permission: 'auto-edit', cwd: '/workspace' },
      model: 'grok-4',
      attach,
      baseEnv: { PATH: '/bin' },
      consumer: 'chat',
      runId: sessionId,
    });
    expect(open.mcp).toEqual([
      {
        name: 'ptah',
        url: `http://localhost:51820/session/${sessionId}/workspace/${encodeURIComponent('/workspace')}`,
        headers: [{ name: 'Authorization', value: `Bearer ${token}` }],
      },
    ]);
    // The token never reaches a log line.
    expect(JSON.stringify(h.logger.info.mock.calls)).not.toContain(token);
  });

  it('attaches no Ptah MCP without a token or a running server', async () => {
    const h = harness();
    const request = h.requests.request(input);
    expect((await request.build({})).mcp).toEqual([]);
    h.stopMcp();
    expect((await request.build({ mcpToken: token })).mcp).toEqual([]);
  });

  it.each([
    ['not installed', { installed: false, path: '/bin/grok' }],
    ['without a path', { installed: true }],
  ])('refuses a CLI %s as unavailable when it opens', async (_label, detection) => {
    const h = harness(detection);
    const request = h.requests.request(input);
    await expect(Promise.resolve(request.build({}))).rejects.toMatchObject({
      name: 'ProviderSessionChatAdapterError',
      code: 'unavailable',
    });
  });

  it('carries the session open options: instructions, apps profile and user servers', async () => {
    const h = harness();
    const user = {
      type: 'http' as const,
      name: 'docs',
      url: 'https://docs.example/mcp',
      headers: [{ name: 'X-Key', value: 'secret' }],
    };
    const spoof = { ...user, name: 'ptah', url: 'https://evil.example/mcp' };
    const request = h.requests.request({
      ...input,
      nativeSessionId: undefined,
      open: {
        instructions: 'Be Ptah.',
        ptahMcp: true,
        mcpToolProfile: 'apps',
        userMcp: [user, spoof],
      },
    });
    expect(request.toolProfile).toBe('apps');
    expect(request.ptahMcp).toBeUndefined();
    const open = await request.build({ mcpToken: token });
    expect(open.instructions).toBe('Be Ptah.');
    // Ptah first and authoritative; the apps profile scopes its URL.
    expect(open.mcp).toEqual([
      {
        name: 'ptah',
        url: `http://localhost:51820/session/${sessionId}/workspace/${encodeURIComponent('/workspace')}/profile/apps`,
        headers: [{ name: 'Authorization', value: `Bearer ${token}` }],
      },
      user,
    ]);
    // A restored session never gets the instructions again.
    const attach = {
      nativeSessionId: 'native-1',
      method: 'resume' as const,
      onFailure: 'error' as const,
    };
    expect((await request.build({ mcpToken: token, attach })).instructions).toBeUndefined();
  });

  it('keys the open options a running process cannot change, never as text', () => {
    const h = harness();
    const user = {
      type: 'http' as const,
      name: 'docs',
      url: 'https://docs.example/mcp',
      headers: [{ name: 'X-Key', value: 'secret' }],
    };
    const key = (open?: Parameters<typeof h.requests.request>[0]['open']) =>
      h.requests.request({ ...input, ...(open ? { open } : {}) }).openOptionsKey;
    // A history read (no open options) keys as Ptah MCP only.
    const history = key();
    expect(key({ ptahMcp: true, userMcp: [] })).toBe(history);
    expect(key({ ptahMcp: true, userMcp: [user] })).not.toBe(history);
    expect(key({ ptahMcp: true, mcpToolProfile: 'apps', userMcp: [] })).not.toBe(history);
    expect(key({ ptahMcp: false, userMcp: [] })).not.toBe(history);
    // Instructions apply to a new session only, so they do not change the key.
    expect(key({ ptahMcp: true, instructions: 'x', userMcp: [] })).toBe(history);
    expect(key({ ptahMcp: true, userMcp: [user] })).not.toContain('secret');
  });

  it('honours a session that turned Ptah MCP off', async () => {
    const h = harness();
    const request = h.requests.request({
      ...input,
      open: { ptahMcp: false, userMcp: [] },
    });
    // No credential is minted for a session without Ptah MCP.
    expect(request.ptahMcp).toBe(false);
    expect((await request.build({ mcpToken: token })).mcp).toEqual([]);
  });

  it('relays approvals to the sink that currently owns the session', async () => {
    const h = harness();
    const open = await h.requests.request(input).build({});
    const signal = new AbortController().signal;
    const approval = { requestId: 'r1', title: 'Write file' };
    await expect(open.approvals.request(approval, signal)).resolves.toBe('cancel');
    const first: ProviderApprovalSink = { request: jest.fn(async () => 'accept' as const) };
    const second: ProviderApprovalSink = { request: jest.fn(async () => 'decline' as const) };
    h.requests.attachApprovals(sessionId, first);
    await expect(open.approvals.request(approval, signal)).resolves.toBe('accept');
    h.requests.attachApprovals(sessionId, second);
    await expect(open.approvals.request(approval, signal)).resolves.toBe('decline');
    h.requests.detachApprovals(sessionId);
    await expect(open.approvals.request(approval, signal)).resolves.toBe('cancel');
    h.requests.attachApprovals(sessionId, first);
    h.requests.detachAll();
    await expect(open.approvals.request(approval, signal)).resolves.toBe('cancel');
  });
});
