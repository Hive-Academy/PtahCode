/**
 * Whether Antigravity (`agy`) is signed in, read without a model turn and
 * without starting the agent (`agy acp` unpacks its runtime).
 *
 * agy has no `auth`/`status` subcommand. Its auth chain (`auth.ChainedAuth`
 * in the agy binary) tries, in order: an API key in the environment
 * (`GEMINI_API_KEY` / `GOOGLE_API_KEY`), Application Default Credentials
 * (`GOOGLE_APPLICATION_CREDENTIALS`), then its own browser OAuth sign-in,
 * which it stores in the OS keyring under service `gemini`, account
 * `antigravity` (`keyringAuth: loaded token` in `cli.log`; the Windows
 * credential target is `gemini:antigravity`).
 *
 * The keyring entry is checked for presence only, never read:
 * - Windows: `cmdkey /list:gemini:antigravity` lists the target and user name
 *   (never the secret);
 * - macOS: `security find-generic-password -s gemini -a antigravity` without
 *   `-w`/`-g` prints attributes only and exits 0 when the item exists.
 * Linux has no presence-only query (`secret-tool lookup`/`search` print the
 * secret), so it answers `unknown`.
 *
 * `unknown` (no query, or the query failed or timed out) keeps the old
 * optimistic answer at the caller; a missing sign-in then surfaces as
 * `auth-required` when the session opens.
 */
import { execFile } from 'node:child_process';
import { win32 } from 'node:path';

export type AgySignInState = 'signed-in' | 'signed-out' | 'unknown';

/** Keyring service and account agy stores its OAuth sign-in under. */
export const AGY_KEYRING_SERVICE = 'gemini';
export const AGY_KEYRING_ACCOUNT = 'antigravity';
export const AGY_SIGN_IN_QUERY_TIMEOUT_MS = 5_000;

/** Environment variables agy's auth chain accepts in place of a sign-in. */
const AGY_ENV_CREDENTIALS = [
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
] as const;

/** Runs one presence query; resolves stdout and the exit code, rejects only on spawn failure or timeout. */
export type AgyKeyringQuery = (
  command: string,
  args: readonly string[],
) => Promise<{ readonly stdout: string; readonly exitCode: number }>;

export interface AgySignInDeps {
  readonly platform?: NodeJS.Platform;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly query?: AgyKeyringQuery;
}

const nativeQuery: AgyKeyringQuery = (command, args) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      command,
      [...args],
      {
        timeout: AGY_SIGN_IN_QUERY_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 64 * 1024,
      },
      (error, stdout) => {
        if (error && typeof error.code !== 'number') {
          reject(error);
          return;
        }
        resolve({
          stdout: String(stdout),
          exitCode: typeof error?.code === 'number' ? error.code : 0,
        });
      },
    );
    // A stdin EPIPE (child already exited) must not become an unhandled
    // 'error' event; the execFile callback reports the real outcome.
    child.stdin?.on('error', () => undefined);
    child.stdin?.end();
  });

/** How long one sign-in answer is reused (auth status and connection checks poll it). */
export const AGY_SIGN_IN_CACHE_TTL_MS = 30_000;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Reads `cmdkey /list:<target>` output. A stored credential has a line of its
 * own, `<label>: [<type>:target=]<target>` with the label localized
 * ("Target", "Ziel", "Cible"), and nothing after the target. The heading
 * ("Currently stored credentials for <target>:") ends with a colon after the
 * target, so it never counts. No credential line but the target named
 * (the heading): signed out. Neither: output not understood, `unknown`.
 */
export function parseCmdkeyList(stdout: string, target: string): AgySignInState {
  const name = escapeRegExp(target);
  const credentialLine = new RegExp(`^[^:\\r\\n]+:\\s*(?:\\S*?[=:])?${name}\\s*$`, 'im');
  if (credentialLine.test(stdout)) return 'signed-in';
  return stdout.toLowerCase().includes(target.toLowerCase()) ? 'signed-out' : 'unknown';
}

/**
 * One reader whose answer is reused for {@link AGY_SIGN_IN_CACHE_TTL_MS}, so a
 * burst of status and connection checks spawns one keyring query. Concurrent
 * calls share the query in flight; a rejected read is not cached.
 */
export function createCachedAgySignIn(
  read: () => Promise<AgySignInState> = readAgySignIn,
  ttlMs: number = AGY_SIGN_IN_CACHE_TTL_MS,
  now: () => number = Date.now,
): () => Promise<AgySignInState> {
  let cached: { readonly at: number; readonly answer: Promise<AgySignInState> } | undefined;
  return () => {
    if (cached && now() - cached.at < ttlMs) return cached.answer;
    const answer = read();
    const entry = { at: now(), answer };
    cached = entry;
    // Not a swallow: the caller gets `answer` and its rejection; this only
    // drops the failed entry so the next call queries again.
    void answer.catch(() => {
      if (cached === entry) cached = undefined;
    });
    return answer;
  };
}

/**
 * The sign-in state of agy. Rejects when the keyring query cannot run; the
 * caller decides what an unreadable state means.
 */
export async function readAgySignIn(
  deps: AgySignInDeps = {},
): Promise<AgySignInState> {
  const env = deps.env ?? process.env;
  if (AGY_ENV_CREDENTIALS.some((name) => (env[name] ?? '').trim() !== ''))
    return 'signed-in';
  const platform = deps.platform ?? process.platform;
  const query = deps.query ?? nativeQuery;
  if (platform === 'win32') {
    const target = `${AGY_KEYRING_SERVICE}:${AGY_KEYRING_ACCOUNT}`;
    const cmdkey = win32.join(env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'cmdkey.exe');
    const { stdout, exitCode } = await query(cmdkey, [`/list:${target}`]);
    if (exitCode !== 0) return 'unknown';
    return parseCmdkeyList(stdout, target);
  }
  if (platform === 'darwin') {
    const { exitCode } = await query('/usr/bin/security', [
      'find-generic-password',
      '-s',
      AGY_KEYRING_SERVICE,
      '-a',
      AGY_KEYRING_ACCOUNT,
    ]);
    // 44 = errSecItemNotFound; anything else non-zero is not an answer.
    if (exitCode === 0) return 'signed-in';
    return exitCode === 44 ? 'signed-out' : 'unknown';
  }
  return 'unknown';
}
