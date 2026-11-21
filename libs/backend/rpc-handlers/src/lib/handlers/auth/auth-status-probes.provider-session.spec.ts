import 'reflect-metadata';
import type { ProviderSessionAuthStatusRows } from '../../chat/provider-session-host/provider-session-auth-status';
import { AuthStatusProbes, type AuthStatusProbesDeps } from './auth-status-probes';
import { AUTH_PROBE_TIMEOUT_MS } from './probe-timeout';

const grok: ProviderSessionAuthStatusRows = {
  grok: { installed: true, authenticated: true, signInHint: 'run `grok login`' },
};

function probes(probe?: jest.Mock) {
  const deps = {
    logger: { warn: jest.fn() },
    ...(probe ? { providerSessions: { probe } } : {}),
  } as unknown as AuthStatusProbesDeps;
  return new AuthStatusProbes(deps);
}

describe('AuthStatusProbes provider sessions', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('answers undefined when the host binds no probe', async () => {
    await expect(probes().probeProviderSessions()).resolves.toBeUndefined();
  });

  it('answers a timed-out probe with the last rows, never an empty set (M-6)', async () => {
    const probe = jest.fn(async () => grok);
    const subject = probes(probe);
    await expect(subject.probeProviderSessions()).resolves.toEqual(grok);

    probe.mockImplementationOnce(() => new Promise(() => undefined));
    const slow = subject.probeProviderSessions();
    await jest.advanceTimersByTimeAsync(AUTH_PROBE_TIMEOUT_MS);
    await expect(slow).resolves.toEqual(grok);
  });

  it('omits the rows (unknown) when the first probe times out', async () => {
    const subject = probes(jest.fn(() => new Promise(() => undefined)));
    const slow = subject.probeProviderSessions();
    await jest.advanceTimersByTimeAsync(AUTH_PROBE_TIMEOUT_MS);
    await expect(slow).resolves.toBeUndefined();
  });

  it('refreshes the rows when a slow probe finishes after its timeout', async () => {
    let finish!: (rows: ProviderSessionAuthStatusRows) => void;
    const probe = jest.fn(
      () => new Promise<ProviderSessionAuthStatusRows>((resolve) => (finish = resolve)),
    );
    const subject = probes(probe);
    const slow = subject.probeProviderSessions();
    await jest.advanceTimersByTimeAsync(AUTH_PROBE_TIMEOUT_MS);
    await expect(slow).resolves.toBeUndefined();
    finish(grok);
    await Promise.resolve();
    probe.mockImplementationOnce(() => new Promise(() => undefined));
    const next = subject.probeProviderSessions();
    await jest.advanceTimersByTimeAsync(AUTH_PROBE_TIMEOUT_MS);
    await expect(next).resolves.toEqual(grok);
  });
});
