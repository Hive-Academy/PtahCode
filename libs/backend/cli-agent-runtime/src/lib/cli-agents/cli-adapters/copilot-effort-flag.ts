import type { IProcessSpawner } from '@ptah-extension/platform-core';
import { probeCliStdout } from './cli-stdout-probe';

type CopilotEffortFlag = '--reasoning-effort' | '--effort';

const COPILOT_HELP_TIMEOUT_MS = 5000;
const effortFlagProbes = new Map<string, Promise<CopilotEffortFlag | undefined>>();

export function probeCopilotEffortFlag(
  binaryPath: string,
  version: string | undefined,
  spawner?: IProcessSpawner,
): Promise<CopilotEffortFlag | undefined> {
  const key = JSON.stringify([binaryPath, version]);
  const cached = effortFlagProbes.get(key);
  if (cached) return cached;

  const probe = readEffortFlag(binaryPath, spawner).catch(() => {
    effortFlagProbes.delete(key);
    console.warn('[Copilot CLI] Could not probe effort flag support.');
    return undefined;
  });
  effortFlagProbes.set(key, probe);
  return probe;
}

async function readEffortFlag(
  binaryPath: string,
  spawner?: IProcessSpawner,
): Promise<CopilotEffortFlag | undefined> {
  const help = await probeCliStdout(binaryPath, ['--help'], {
    spawner,
    timeoutMs: COPILOT_HELP_TIMEOUT_MS,
    requireSuccess: true,
  });
  if (help === undefined) throw new Error('Copilot help probe failed');

  if (/(?:^|[\s,|([])--reasoning-effort(?=$|[\s=,|)\]])/.test(help)) {
    return '--reasoning-effort';
  }
  if (/(?:^|[\s,|([])--effort(?=$|[\s=,|)\]])/.test(help)) {
    return '--effort';
  }
  return undefined;
}
