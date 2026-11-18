import {
  testSystemLane,
  type ProvidersLaneRpc,
} from './providers-system-lane-test';

describe('system lane test', () => {
  const call = jest.fn();
  const rpc = call as ProvidersLaneRpc;

  beforeEach(() => call.mockReset());

  it.each(['claude', 'codex'] as const)(
    'returns only Not detected. for an absent or uninstalled %s lane',
    async (cli) => {
      for (const clis of [
        [],
        [{ cli, installed: false, messagingMode: 'none' }],
      ]) {
        call.mockReset().mockResolvedValue({ clis });
        expect(
          await testSystemLane(rpc, cli, { profileId: 'private-profile' }),
        ).toEqual({
          id: cli,
          success: false,
          latencyMs: expect.any(Number),
          reason: 'Not detected.',
        });
        expect(call.mock.calls).toEqual([['agent:detectClis', undefined]]);
      }
    },
  );

  it.each([
    [true, 'signed-in', undefined, null],
    [false, 'signed-in', undefined, 'Account not ready.'],
    [true, 'signed-out', undefined, 'Account not ready.'],
    [true, 'signed-in', { kind: 'login' }, 'Account not ready.'],
  ])(
    'checks the selected Claude account (%j, %s, %j)',
    async (ok, state, operation, reason) => {
      call
        .mockResolvedValueOnce({
          clis: [{ cli: 'claude', installed: true, messagingMode: 'none' }],
        })
        .mockResolvedValueOnce({
          ok,
          account: { state, label: 'private host text' },
          operation,
        });
      const result = await testSystemLane(rpc, 'claude', {
        profileId: 'selected-profile',
      });
      expect(result).toMatchObject({ success: reason === null, reason });
      expect(call).toHaveBeenLastCalledWith('provider:getAccountStatus', {
        provider: 'claude',
        profileId: 'selected-profile',
      });
      expect(JSON.stringify(result)).not.toContain('private');
    },
  );

  it.each([
    [true, 'connected', null],
    [true, 'signed-out', 'Account not signed in.'],
    [false, 'connected', 'Account not signed in.'],
  ])('checks ambient Claude login (%j, %s)', async (ok, state, reason) => {
    call
      .mockResolvedValueOnce({
        clis: [{ cli: 'claude', installed: true, messagingMode: 'none' }],
      })
      .mockResolvedValueOnce({ ok, status: { state } });
    expect(await testSystemLane(rpc, 'claude', 'ambient')).toMatchObject({
      success: reason === null,
      reason,
    });
    expect(call).toHaveBeenLastCalledWith('provider:getAmbientClaudeStatus', {
      provider: 'claude',
      refresh: true,
    });
  });
});
