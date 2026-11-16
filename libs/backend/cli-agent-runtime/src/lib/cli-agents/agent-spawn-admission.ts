import type { AgentId, AgentProcessInfo } from '@ptah-extension/shared';
import type { TrackedAgent } from './tracked-agent';

export interface SpawnAdmission {
  readonly agentId: AgentId;
  readonly startedAt: string;
}

export const SPAWN_ADMISSION_WATCHDOG_MS = 120_000;

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
