import { failureKind, safeFailureCopy } from './safe-failure-copy';

const FALLBACK = 'Something went wrong.';

describe('safeFailureCopy', () => {
  it.each([
    ['RPC timeout: wizard:recommend-skills', 'timeout'],
    ['EACCES: permission denied, open /etc/x', 'permission'],
    ['ENOSPC: no space left on device', 'disk-full'],
    ['2 file(s) failed to install', 'partial'],
    ['plan token expired', 'plan-expired'],
    ['getaddrinfo ENOTFOUND registry.example', 'offline'],
    ['ENOENT: no such file', 'not-found'],
    ['', 'unknown'],
  ])('classifies %p as %s', (raw, kind) => {
    expect(failureKind(raw)).toBe(kind);
  });

  it('never returns any part of a secret-bearing message', () => {
    const raw =
      'Bearer sk-live-SECRET123 rejected by https://internal.example/api?key=abc';
    const copy = safeFailureCopy(raw, FALLBACK);
    expect(copy).toBe(FALLBACK);
    for (const leak of ['sk-live', 'internal.example', 'key=abc', 'Bearer']) {
      expect(copy).not.toContain(leak);
    }
  });

  it('never returns markup from an HTML-looking message', () => {
    const copy = safeFailureCopy(
      '<img src=x onerror="alert(1)"><b>boom</b>',
      FALLBACK,
    );
    expect(copy).toBe(FALLBACK);
    expect(copy).not.toMatch(/[<>]/);
  });

  it('keeps the known kind but drops the path of a permission error', () => {
    const copy = safeFailureCopy(
      'EACCES: permission denied, open /home/me/.ssh/id_rsa',
      FALLBACK,
    );
    expect(copy).toContain('permission denied');
    expect(copy).not.toContain('.ssh');
  });

  it.each([
    [
      'not-signed-in',
      'openrouter',
      'Sign in to OpenRouter. Then retry guidance.',
    ],
    [
      'model-stale',
      'openrouter',
      'The saved model for OpenRouter is not available. Choose another model in Settings > Background models.',
    ],
    [
      'model-missing',
      'openrouter',
      'The Setup model for OpenRouter is not set. Choose a model in Settings > Background models.',
    ],
    [
      'model-missing',
      undefined,
      'The Setup model is not set. Choose a model in Settings > Background models.',
    ],
    [
      'provider-missing',
      undefined,
      'The Setup provider is not set. Choose a provider and model in Settings > Background models.',
    ],
    [
      'provider-unknown',
      'unknown-provider',
      'The Setup provider is not recognized. Choose a provider in Settings > Background models.',
    ],
    [
      'provider-unsupported',
      'openrouter',
      'The Setup provider is not supported. Choose another provider in Settings > Background models.',
    ],
    [
      'provider-unavailable',
      'openrouter',
      'OpenRouter is unavailable. Check the provider connection and retry.',
    ],
  ])('selects fixed Setup copy for %s', (reason, provider, expected) => {
    const copy = safeFailureCopy(
      `SETUP_MODEL_INVALID reason=${reason}${provider ? ` provider=${provider}` : ''}: raw provider failure Bearer SECRET`,
      FALLBACK,
    );

    expect(copy).toBe(expected);
    expect(copy).not.toMatch(/raw provider failure|Bearer|SECRET/);
  });

  it('selects fixed Setup remediation from the transport code without raw detail', () => {
    const copy = safeFailureCopy(
      'SETUP_MODEL_INVALID: Setup failed for /private/workspace with Bearer SECRET',
      FALLBACK,
    );
    expect(copy).toBe(
      'Setup model cannot run guidance. Update Background models and retry.',
    );
    expect(copy).not.toMatch(/private|SECRET/);
  });

  it('uses the fallback for null and undefined', () => {
    expect(safeFailureCopy(null, FALLBACK)).toBe(FALLBACK);
    expect(safeFailureCopy(undefined, FALLBACK)).toBe(FALLBACK);
  });
});
