/**
 * The test-only tee recorder: bytes pass through unchanged, each JSON-RPC
 * line is recorded once per direction, and redaction removes local paths,
 * bearer tokens and agy's account tier.
 */
import { createMockLogger } from '@ptah-extension/shared/testing';
import { createFakeAcpAgent, createFakeAcpTransport } from '../lib/__fixtures__/fake-acp-agent';
import { createAcpSession } from '../lib/acp-session-runtime';
import type { AcpVendorProfile } from '../lib/acp-vendor-profile';
import { createAcpTeeRecorder, redactAcpEnvelopes } from './tee-transport';

const profile: AcpVendorProfile = {
  vendor: 'antigravity',
  displayName: 'Test Agent',
  signInHint: 'sign in',
  buildSpawn: () => ({ args: ['acp'] }),
  buildMcpServers: () => [],
};

describe('createAcpTeeRecorder', () => {
  it('records both directions and the exit of a real session without changing it', async () => {
    const agent = createFakeAcpAgent({ sessionId: 'sess-1' });
    agent.handle('session/prompt', async (params, fake) => {
      await fake.sessionUpdate(String(params['sessionId']), {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'hi' },
      });
      return { result: { stopReason: 'end_turn' } };
    });
    const recorder = createAcpTeeRecorder(() => createFakeAcpTransport(agent));
    const abort = new AbortController();
    const deltas: string[] = [];
    const session = createAcpSession({
      profile,
      options: { workingDirectory: '/w', mcp: [] },
      command: 'agy',
      baseEnv: {},
      logger: createMockLogger(),
      signal: abort.signal,
      transportFactory: recorder.factory,
      onEvent: (event) => {
        if (event.type === 'textDelta') deltas.push(event.delta);
      },
    });
    await expect(session.start()).resolves.toEqual({ ok: true, restoredContext: false });
    await expect(session.prompt('hello')).resolves.toBe(0);
    abort.abort();
    await session.exited;
    await new Promise((resolve) => setImmediate(resolve));

    expect(deltas).toEqual(['hi']);
    const methods = recorder.envelopes.map((envelope) => [
      envelope.dir,
      envelope.msg?.['method'] ?? (envelope.dir === 'exit' ? 'exit' : 'reply'),
    ]);
    expect(methods).toEqual(
      expect.arrayContaining([
        ['out', 'initialize'],
        ['in', 'reply'],
        ['out', 'session/new'],
        ['out', 'session/prompt'],
        ['in', 'session/update'],
        ['exit', 'exit'],
      ]),
    );
    expect(
      recorder.envelopes.filter((envelope) => envelope.msg?.['method'] === 'session/prompt'),
    ).toHaveLength(1);
  });
});

describe('redactAcpEnvelopes', () => {
  it('replaces paths in both slash forms, bearer tokens and a non-boolean tier', () => {
    const redacted = redactAcpEnvelopes(
      [
        {
          dir: 'out',
          msg: {
            cwd: 'C:\\Users\\someone\\proj',
            url: 'http://localhost:1/workspace/C%3A%5CUsers%5Csomeone%5Cproj',
            headers: [{ name: 'Authorization', value: 'Bearer abc.def-123' }],
          },
        },
        { dir: 'in', msg: { _meta: { antigravity: { tier: 'ultra' } }, caps: { tier: true } } },
        { dir: 'stderr', msg: { line: 'log at C:/Users/someone/proj/x.log' } },
      ],
      {
        replace: [
          ['C:\\Users\\someone\\proj', '<cwd>'],
          [encodeURIComponent('C:\\Users\\someone\\proj'), '<cwd>'],
          ['C:\\Users\\someone', '<home>'],
        ],
      },
    );
    expect(redacted).toEqual([
      {
        dir: 'out',
        msg: {
          cwd: '<cwd>',
          url: 'http://localhost:1/workspace/<cwd>',
          headers: [{ name: 'Authorization', value: 'Bearer <redacted>' }],
        },
      },
      { dir: 'in', msg: { _meta: { antigravity: { tier: '<redacted>' } }, caps: { tier: true } } },
      { dir: 'stderr', msg: { line: 'log at <cwd>/x.log' } },
    ]);
  });
});
