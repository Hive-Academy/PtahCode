import 'reflect-metadata';
import {
  SDK_FIRST_BYTE_TIMEOUT_ENV,
  SDK_FIRST_BYTE_TIMEOUT_MS,
  buildSafeEnv,
  experimentalBetaEnv,
  firstByteTimeoutEnv,
} from './build-safe-env';
import { NO_ACTIVITY_TIMEOUT_MS } from './no-activity-watchdog';

describe('experimentalBetaEnv', () => {
  const KEY = 'PTAH_ENABLE_EXPERIMENTAL_BETAS';
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[KEY];
    delete process.env[KEY];
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env[KEY];
    } else {
      process.env[KEY] = original;
    }
  });

  it('disables experimental betas for a remote third-party base URL', () => {
    expect(experimentalBetaEnv('https://api.kimi.ai/coding/')).toEqual({
      CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
    });
  });

  it('does NOT disable for a local translation proxy (Codex/Copilot)', () => {
    expect(experimentalBetaEnv('http://127.0.0.1:61010')).toEqual({});
    expect(experimentalBetaEnv('http://localhost:51234')).toEqual({});
  });

  it('does not disable for the Anthropic base URL', () => {
    expect(experimentalBetaEnv('https://api.anthropic.com')).toEqual({});
  });

  it('does not disable when no base URL is set', () => {
    expect(experimentalBetaEnv(undefined)).toEqual({});
  });

  it('keeps experimental betas on for a remote third-party URL when the override is set', () => {
    process.env[KEY] = '1';
    expect(experimentalBetaEnv('https://api.kimi.ai/coding/')).toEqual({});
  });
});

describe('firstByteTimeoutEnv (TASK_2026_2288 A)', () => {
  it('keeps the SDK first-byte wait inside the watchdog window', () => {
    // The SDK must announce its retry before the watchdog can stop the turn.
    expect(SDK_FIRST_BYTE_TIMEOUT_MS).toBeLessThan(NO_ACTIVITY_TIMEOUT_MS);
    expect(firstByteTimeoutEnv({})).toEqual({
      [SDK_FIRST_BYTE_TIMEOUT_ENV]: String(SDK_FIRST_BYTE_TIMEOUT_MS),
    });
  });

  it('keeps a value the user set', () => {
    expect(
      firstByteTimeoutEnv({ [SDK_FIRST_BYTE_TIMEOUT_ENV]: ' 240000 ' }),
    ).toEqual({ [SDK_FIRST_BYTE_TIMEOUT_ENV]: '240000' });
  });

  it('uses the default for a blank value', () => {
    expect(firstByteTimeoutEnv({ [SDK_FIRST_BYTE_TIMEOUT_ENV]: '  ' })).toEqual({
      [SDK_FIRST_BYTE_TIMEOUT_ENV]: String(SDK_FIRST_BYTE_TIMEOUT_MS),
    });
  });

  describe('buildSafeEnv', () => {
    let original: string | undefined;

    beforeEach(() => {
      original = process.env[SDK_FIRST_BYTE_TIMEOUT_ENV];
    });

    afterEach(() => {
      if (original === undefined) delete process.env[SDK_FIRST_BYTE_TIMEOUT_ENV];
      else process.env[SDK_FIRST_BYTE_TIMEOUT_ENV] = original;
    });

    it('copies a value that is set only in the host process env', () => {
      process.env[SDK_FIRST_BYTE_TIMEOUT_ENV] = '240000';
      expect(buildSafeEnv({})[SDK_FIRST_BYTE_TIMEOUT_ENV]).toBe('240000');
    });

    it('prefers the provider value to the host process value', () => {
      process.env[SDK_FIRST_BYTE_TIMEOUT_ENV] = '240000';
      expect(
        buildSafeEnv({ [SDK_FIRST_BYTE_TIMEOUT_ENV]: '200000' })[
          SDK_FIRST_BYTE_TIMEOUT_ENV
        ],
      ).toBe('200000');
    });

    it('sets the default when no value is set', () => {
      delete process.env[SDK_FIRST_BYTE_TIMEOUT_ENV];
      expect(buildSafeEnv({})[SDK_FIRST_BYTE_TIMEOUT_ENV]).toBe(
        String(SDK_FIRST_BYTE_TIMEOUT_MS),
      );
    });
  });
});
