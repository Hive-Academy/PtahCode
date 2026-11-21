import 'reflect-metadata';
import {
  CodexChatAdapterError,
  ProviderSessionChatAdapterError,
  type ProviderSessionChatAdapterErrorCode,
} from '@ptah-extension/agent-sdk';
import {
  MAX_OPTION_LENGTH,
  MAX_SIGN_IN_HINT_LENGTH,
  PROVIDER_SESSION_SIGN_IN_FALLBACK,
  providerSessionFailure,
} from './provider-session-failure';

const SECRET_CAUSE = new Error('C:/Users/dev/.agy/token=abc');

describe('providerSessionFailure', () => {
  it.each<[ProviderSessionChatAdapterErrorCode, string]>([
    ['busy', 'PROVIDER_SESSION_BUSY'],
    ['limit', 'PROVIDER_SESSION_LIMIT'],
    ['unavailable', 'PROVIDER_SESSION_UNAVAILABLE'],
    ['resume-failed', 'PROVIDER_SESSION_RESUME_FAILED'],
    ['runtime-failed', 'PROVIDER_SESSION_RUNTIME_FAILED'],
    ['unsupported-option', 'PROVIDER_SESSION_UNSUPPORTED_OPTION'],
  ])('maps %s to %s with fixed text', (code, errorCode) => {
    const result = providerSessionFailure(
      new ProviderSessionChatAdapterError(code, 'send', { cause: SECRET_CAUSE }),
    );

    expect(result).toEqual({
      success: false,
      error: expect.any(String),
      errorCode,
    });
    expect(result?.error).not.toContain('token');
    expect(result?.error).not.toContain('Users');
  });

  it('names the refused option', () => {
    expect(
      providerSessionFailure(
        new ProviderSessionChatAdapterError('unsupported-option', 'start', {
          option: 'effort',
        }),
      ),
    ).toEqual({
      success: false,
      error: 'This chat provider does not support the "effort" option.',
      errorCode: 'PROVIDER_SESSION_UNSUPPORTED_OPTION',
    });
  });

  it('maps cancelled to a cancelled result with no error', () => {
    expect(
      providerSessionFailure(
        new ProviderSessionChatAdapterError('cancelled', 'start'),
      ),
    ).toEqual({ success: false, cancelled: true });
  });

  it('maps auth-required to AUTH_REQUIRED with the sign-in hint and provider', () => {
    expect(
      providerSessionFailure(
        new ProviderSessionChatAdapterError('auth-required', 'start', {
          providerId: 'antigravity-cli',
          signInHint: 'Run agy once in a terminal and sign in.',
        }),
      ),
    ).toEqual({
      success: false,
      error: 'Run agy once in a terminal and sign in.',
      errorCode: 'AUTH_REQUIRED',
      providerId: 'antigravity-cli',
    });
  });

  it('falls back to fixed sign-in text when the hint is missing or blank', () => {
    expect(
      providerSessionFailure(
        new ProviderSessionChatAdapterError('auth-required', 'start', {
          signInHint: '   ',
        }),
      ),
    ).toEqual({
      success: false,
      error: PROVIDER_SESSION_SIGN_IN_FALLBACK,
      errorCode: 'AUTH_REQUIRED',
    });
  });

  it('strips control characters from and caps the sign-in hint', () => {
    const result = providerSessionFailure(
      new ProviderSessionChatAdapterError('auth-required', 'start', {
        signInHint: 'Run' + '\u001b[31m' + ' agy login' + '\u202e' + '\n' + 'x'.repeat(1000),
      }),
    );
    const error = result && !result.success ? (result.error ?? '') : '';
    expect(error.startsWith('Run [31m agy login x')).toBe(true);
    // eslint-disable-next-line no-control-regex
    expect(error).not.toMatch(/[\u0000-\u001f\u202e]/);
    expect(error.length).toBeLessThanOrEqual(MAX_SIGN_IN_HINT_LENGTH);
    expect(error.endsWith('…')).toBe(true);
  });

  it('caps and cleans the refused option name', () => {
    const result = providerSessionFailure(
      new ProviderSessionChatAdapterError('unsupported-option', 'start', {
        option: 'effort' + '\u0000' + 'y'.repeat(500),
      }),
    );
    const error = result && !result.success ? (result.error ?? '') : '';
    expect(error).not.toContain('\u0000');
    expect(error.length).toBeLessThan(MAX_OPTION_LENGTH + 60);
  });

  it('leaves Codex and unrelated errors to the caller', () => {
    expect(
      providerSessionFailure(new CodexChatAdapterError('busy', 'send')),
    ).toBeUndefined();
    expect(providerSessionFailure(new Error('busy'))).toBeUndefined();
    expect(providerSessionFailure({ code: 'busy' })).toBeUndefined();
    expect(providerSessionFailure(undefined)).toBeUndefined();
  });
});
