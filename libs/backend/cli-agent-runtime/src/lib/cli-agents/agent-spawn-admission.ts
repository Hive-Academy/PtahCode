import type { AgentId, AgentProcessInfo } from '@ptah-extension/shared';
import type { TrackedAgent } from './tracked-agent';

export interface SpawnAdmission {
  readonly agentId: AgentId;
  readonly startedAt: string;
}

export const SPAWN_ADMISSION_WATCHDOG_MS = 120_000;

/** The admission watchdog begins after a lane leaves the memory queue. */
export function armSpawnAdmissionWatchdog(
  tracked: TrackedAgent,
  fail: () => void,
): void {
  if (tracked.info.status !== 'starting' || tracked.admissionTimer) return;
  tracked.admissionTimer = setTimeout(fail, SPAWN_ADMISSION_WATCHDOG_MS);
  tracked.admissionTimer.unref?.();
}

/** A handleless record that is addressable while detection and preflight run. */
export function startingAgent(info: AgentProcessInfo): TrackedAgent {
  return {
    info,
    process: null,
    stdoutBuffer: '',
    stderrBuffer: '',
    stdoutLineCount: 0,
    stderrLineCount: 0,
    truncated: false,
    hasExited: false,
    subprocessReleased: false,
    accumulatedSegments: [],
    accumulatedStreamEvents: [],
    streamCapLogged: false,
    pendingMessages: [],
    reportsDelivered: 0,
    turnSegmentStart: 0,
    turnStartedAt: info.startedAt,
  };
}
