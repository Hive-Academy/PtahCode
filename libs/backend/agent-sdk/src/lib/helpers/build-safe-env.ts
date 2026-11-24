/**
 * Build a minimal environment for custom agent processes.
 *
 * Only passes platform-essential variables (PATH, HOME, TEMP, etc.)
 * plus the provider-specific auth variables (e.g., ANTHROPIC_API_KEY,
 * ANTHROPIC_BASE_URL, tier mappings). This prevents leaking sensitive
 * host environment variables to third-party API endpoints.
 *
 * Used by both PtahCliRegistry (for validation queries) and
 * PtahCliAdapter (for chat sessions).
 *
 * @param authEnv - Provider-specific environment variables
 * @returns Minimal env safe for custom agent processes
 */
import type { AuthEnv } from '@ptah-extension/shared';
import { buildTierEnvDefaults } from './sdk-model-service';

function isLocalProxyUrl(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/|$)/i.test(
    url,
  );
}

/**
 * Disable experimental CLI betas only for remote third-party endpoints (they
 * may reject the beta headers). Anthropic-direct and the local Codex/Copilot
 * translation proxies keep them on so subagent telemetry still streams.
 * Force on for any provider with `PTAH_ENABLE_EXPERIMENTAL_BETAS=1`.
 */
export function experimentalBetaEnv(
  baseUrl: string | undefined,
): Record<string, string> {
  if (process.env['PTAH_ENABLE_EXPERIMENTAL_BETAS'] === '1') {
    return {};
  }
  const url = baseUrl?.trim();
  if (!url || /^https?:\/\/api\.anthropic\.com\/?$/i.test(url)) {
    return {};
  }
  if (isLocalProxyUrl(url)) {
    return {};
  }
  return { CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1' };
}

export function buildSafeEnv(
  authEnv: AuthEnv,
): Record<string, string | undefined> {
  return {
    PATH: process.env['PATH'],
    HOME: process.env['HOME'],
    USERPROFILE: process.env['USERPROFILE'],
    TMPDIR: process.env['TMPDIR'],
    TEMP: process.env['TEMP'],
    TMP: process.env['TMP'],
    APPDATA: process.env['APPDATA'],
    LOCALAPPDATA: process.env['LOCALAPPDATA'],
    SystemRoot: process.env['SystemRoot'],
    COMSPEC: process.env['COMSPEC'],
    HOMEDRIVE: process.env['HOMEDRIVE'],
    HOMEPATH: process.env['HOMEPATH'],
    windir: process.env['windir'],
    PROGRAMFILES: process.env['PROGRAMFILES'],
    'PROGRAMFILES(X86)': process.env['PROGRAMFILES(X86)'],
    PROGRAMDATA: process.env['PROGRAMDATA'],
    CommonProgramFiles: process.env['CommonProgramFiles'],
    NUMBER_OF_PROCESSORS: process.env['NUMBER_OF_PROCESSORS'],
    PROCESSOR_ARCHITECTURE: process.env['PROCESSOR_ARCHITECTURE'],
    OS: process.env['OS'],
    NODE_OPTIONS: process.env['NODE_OPTIONS'],
    NODE_PATH: process.env['NODE_PATH'],
    NODE_ENV: process.env['NODE_ENV'],
    npm_config_prefix: process.env['npm_config_prefix'],
    npm_config_cache: process.env['npm_config_cache'],
    XDG_CONFIG_HOME: process.env['XDG_CONFIG_HOME'],
    XDG_DATA_HOME: process.env['XDG_DATA_HOME'],
    XDG_CACHE_HOME: process.env['XDG_CACHE_HOME'],
    LANG: process.env['LANG'],
    LC_ALL: process.env['LC_ALL'],
    TERM: process.env['TERM'],
    SHELL: process.env['SHELL'],
    ...buildTierEnvDefaults(authEnv),
    ...authEnv,
    ...experimentalBetaEnv(authEnv.ANTHROPIC_BASE_URL),
    ...firstByteTimeoutEnv({ ...process.env, ...authEnv }),
  };
}

/** The env key of the SDK first-byte wait for an API response. */
export const SDK_FIRST_BYTE_TIMEOUT_ENV = 'CLAUDE_STREAM_FIRST_BYTE_TIMEOUT_MS';

/**
 * The SDK first-byte wait that Ptah sets. It is shorter than
 * `NO_ACTIVITY_TIMEOUT_MS` (180 s), so the SDK reports its own retry
 * (`system/api_retry`) before the no-activity watchdog can stop the turn.
 * Without it the SDK default (about 180 s) and the watchdog race, and the
 * watchdog killed the SDK retry (TASK_2026_2288 A).
 */
export const SDK_FIRST_BYTE_TIMEOUT_MS = 150_000;

/**
 * The SDK first-byte wait for a child process: the value the user set in
 * `env`, else Ptah's default. Always returned, so a sanitized env such as
 * `buildSafeEnv` keeps a value that is set only in the host process env.
 */
export function firstByteTimeoutEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, string> {
  const userValue = env[SDK_FIRST_BYTE_TIMEOUT_ENV]?.trim();
  return {
    [SDK_FIRST_BYTE_TIMEOUT_ENV]: userValue || String(SDK_FIRST_BYTE_TIMEOUT_MS),
  };
}

/**
 * The SDK first-byte wait when no value reaches the SDK, for example a named run
 * whose certified env drops the key. The CLI reads it natively; incident
 * 2026-11-23 (child f7ea7de9) recorded `waited_ms: 181000` with no value set.
 */
export const SDK_DEFAULT_FIRST_BYTE_TIMEOUT_MS = 181_000;

/**
 * The first-byte wait that the SDK will use with `env`: the value that
 * `firstByteTimeoutEnv` passes on, or the SDK default when that value is not a
 * positive number. A user value can be longer than the no-activity watchdog
 * window, so the watchdog must size its window from this value.
 */
export function sdkFirstByteTimeoutMs(
  env: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const ms = Number(firstByteTimeoutEnv(env)[SDK_FIRST_BYTE_TIMEOUT_ENV]);
  return Number.isFinite(ms) && ms > 0 ? ms : SDK_DEFAULT_FIRST_BYTE_TIMEOUT_MS;
}
