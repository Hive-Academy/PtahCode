import { readAcpFixture, recordedResult } from './__fixtures__/acp-fixture-reader';
import { advertisedAuthMethods, checkInitializeReply } from './acp-protocol-negotiation';

describe('checkInitializeReply (D8)', () => {
  it('accepts the recorded agy 1.5.13 and grok 1.0.46 replies (protocol 1)', () => {
    for (const fixture of ['antigravity-p2-handshake.ndjson', 'grok-plain-turn.ndjson']) {
      expect(checkInitializeReply(recordedResult(readAcpFixture(fixture), 'initialize'))).toEqual({
        ok: true,
        version: 1,
      });
    }
  });

  it('accepts version 2 with the v1 shape and refuses any other version', () => {
    expect(checkInitializeReply({ protocolVersion: 2, agentCapabilities: {} })).toEqual({
      ok: true,
      version: 2,
    });
    expect(checkInitializeReply({ protocolVersion: 3 })).toEqual({
      ok: false,
      reason: 'unsupported ACP protocol version 3',
    });
    expect(checkInitializeReply({ protocolVersion: '1' })).toMatchObject({ ok: false });
    expect(checkInitializeReply(null)).toEqual({
      ok: false,
      reason: 'an initialize reply that is not an object',
    });
  });

  it('names the first field that breaks the v1 shape', () => {
    expect(checkInitializeReply({ protocolVersion: 2, agentCapabilities: [] })).toMatchObject({
      ok: false,
      reason: expect.stringContaining('(agentCapabilities)'),
    });
    expect(
      checkInitializeReply({
        protocolVersion: 1,
        agentCapabilities: { sessionCapabilities: 'all' },
      }),
    ).toMatchObject({ reason: expect.stringContaining('agentCapabilities.sessionCapabilities') });
    expect(
      checkInitializeReply({ protocolVersion: 1, authMethods: [{ name: 'x' }] }),
    ).toMatchObject({ reason: expect.stringContaining('authMethods[].id') });
  });

  it('lists the advertised auth method ids', () => {
    const init = recordedResult(readAcpFixture('antigravity-p2-handshake.ndjson'), 'initialize');
    expect(advertisedAuthMethods(init)).toEqual([
      'oauth-personal',
      'oauth-business',
      'gemini-api-key',
      'agent-platform',
    ]);
    expect(advertisedAuthMethods({})).toEqual([]);
  });
});
