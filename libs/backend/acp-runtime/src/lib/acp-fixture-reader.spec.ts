import {
  readAcpFixture,
  recordedUpdatesDuring,
  type AcpFixtureEnvelope,
} from './__fixtures__/acp-fixture-reader';

const update = (text: string): AcpFixtureEnvelope => ({
  dir: 'in',
  msg: {
    method: 'session/update',
    params: { update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } },
  },
});
const request = (id: number): AcpFixtureEnvelope => ({
  dir: 'out',
  msg: { id, method: 'session/prompt' },
});
const reply = (id: number): AcpFixtureEnvelope => ({
  dir: 'in',
  msg: { id, result: { stopReason: 'end_turn' } },
});
const texts = (fixture: readonly AcpFixtureEnvelope[], nth: number): unknown[] =>
  recordedUpdatesDuring(fixture, 'session/prompt', nth).map(
    ({ update: item }) => (item as { content: { text: string } }).content.text,
  );

describe('recordedUpdatesDuring', () => {
  it('returns the updates between a request and its own reply', () => {
    const fixture = [request(1), update('a'), reply(1), request(2), update('b'), reply(2)];
    expect(texts(fixture, 0)).toEqual(['a']);
    expect(texts(fixture, 1)).toEqual(['b']);
  });

  it("refuses a window whose request has no reply before the next request's updates", () => {
    const fixture = [request(1), update('a'), request(2), update('b'), reply(2)];
    expect(() => texts(fixture, 0)).toThrow(
      'fixture session/prompt #0 has no recorded reply before the next session/prompt',
    );
  });

  it('refuses a window that never got a reply, or a request that is not recorded', () => {
    expect(() => texts([request(1), update('a')], 0)).toThrow(
      'fixture session/prompt #0 has no recorded reply',
    );
    expect(() => texts([request(1), reply(1)], 1)).toThrow(
      'fixture has no session/prompt request #1',
    );
  });

  it('reads the recorded Grok windows the runtime specs use', () => {
    expect(
      recordedUpdatesDuring(readAcpFixture('grok-p2-cancel-mid-shell.ndjson'), 'session/prompt')
        .length,
    ).toBeGreaterThan(0);
    expect(
      recordedUpdatesDuring(readAcpFixture('grok-p2-session-load-replay.ndjson'), 'session/load')
        .length,
    ).toBeGreaterThan(0);
  });
});
