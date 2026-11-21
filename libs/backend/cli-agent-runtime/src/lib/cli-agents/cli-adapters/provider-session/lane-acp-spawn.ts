/**
 * The spawn policy a lane hands the ACP runtime. The runtime spawns through
 * `IProcessSpawner` itself (detached, orphan cleanup, no Windows job); the
 * lane adds what every CLI lane gets:
 * - {@link laneAcpBaseEnv}: the host environment plus `CLI_CLEAN_ENV`, the
 *   same base `spawnCli` merges for every lane;
 * - {@link laneAcpCommandPreparer}: a Windows `.cmd` wrapper resolved to its
 *   target (`resolveDirectSpawn`), then the command-line length check.
 */
import type { AcpCommandPreparer } from '@ptah-extension/acp-runtime';
import {
  CLI_CLEAN_ENV,
  assertCommandLineWithinLimit,
  resolveDirectSpawn,
} from '../cli-adapter.utils';

/** Bound on one lane prompt: agy's `--print-timeout 3600s`, kept for every ACP lane. */
export const LANE_ACP_PROMPT_TIMEOUT_MS = 3_600_000;

export function laneAcpBaseEnv(): Record<string, string | undefined> {
  return { ...process.env, ...CLI_CLEAN_ENV };
}

export const laneAcpCommandPreparer: AcpCommandPreparer = async (
  command,
  args,
) => {
  const descriptor = await resolveDirectSpawn(command);
  assertCommandLineWithinLimit(descriptor.command, [
    ...descriptor.prefixArgs,
    ...args,
  ]);
  return descriptor;
};
