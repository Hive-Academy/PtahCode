/**
 * The child environment of an ACP agent: the caller's `baseEnv` (a lane passes
 * the host environment plus its clean-output variables) with the profile's
 * spawn env applied. The result is the complete environment handed to
 * `IProcessSpawner.spawnProcess`, which inherits nothing on its own.
 */

/** How a profile changes the base environment. */
export interface AcpSpawnEnv {
  /** `merge`: `set` over `baseEnv`. `replace`: `set` only, nothing inherited. */
  readonly mode: 'merge' | 'replace';
  readonly set: Readonly<Record<string, string>>;
  /** Names removed after the merge (matched case-insensitively on Windows). */
  readonly remove?: readonly string[];
}

export type AcpChildEnv = Record<string, string | undefined>;

/** Build the complete child environment. Never mutates its inputs. */
export function buildAcpSpawnEnv(
  baseEnv: Readonly<Record<string, string | undefined>>,
  spec: AcpSpawnEnv | undefined,
  platform: NodeJS.Platform = process.platform,
): AcpChildEnv {
  const fold = (name: string): string =>
    platform === 'win32' ? name.toUpperCase() : name;
  const set = spec?.set ?? {};
  const env: AcpChildEnv = spec?.mode === 'replace' ? {} : { ...baseEnv };
  // Windows names are case-insensitive: a `set` key replaces an inherited key
  // of another case (`Path` vs `PATH`) instead of sitting beside it.
  const setNames = new Set(Object.keys(set).map(fold));
  for (const name of Object.keys(env)) {
    if (setNames.has(fold(name))) delete env[name];
  }
  Object.assign(env, set);
  const removed = spec?.remove ?? [];
  if (removed.length === 0) return env;
  const drop = new Set(removed.map(fold));
  for (const name of Object.keys(env)) {
    if (drop.has(fold(name))) delete env[name];
  }
  return env;
}
