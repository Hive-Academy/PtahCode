import type { ChildProcess } from 'child_process';
import type {
  AgentActionNotice,
  AgentProcessInfo,
  ExternalOwnerKey,
  CliOutputSegment,
  FlatStreamEventUnion,
} from '@ptah-extension/shared';
import type { SdkHandle } from './cli-adapters/cli-adapter.interface';
import type { PendingAgentMessage } from './agent-message-router.service';
import type { AgentBudgetCoordinator } from './agent-budget-coordinator';
import type { LaneModelLogState } from './lane-model-log';

/** Ptah monitors that can ask a lane for a handoff and then pause it. */
export type LaneAdmissionSource = 'budget' | 'repeat' | 'inactivity';

export interface TrackedAgent {
  /** Authenticated external transport owner; never exposed through AgentProcessInfo. */
  externalOwner?: ExternalOwnerKey;
  /** In-memory model selection and adapter-reported evidence for terminal logging. */
  modelLog?: LaneModelLogState;
  budget?: AgentBudgetCoordinator;
  budgetTimer?: NodeJS.Timeout;
  budgetCostWarned?: boolean;
  /** Warning withheld at a turn boundary; attached to the next parent message once. */
  heldBudgetWarning?: string;
  /**
   * Latest Ptah ask or pause per monitor (TASK_2026_2297, P4). Budget and repeat notices stay
   * latched until the lane settles; an inactivity notice is cleared by real output. Kept in
   * sync with `info.actionNotice` through {@link setLaneAdmission}.
   */
  laneAdmission?: Partial<Record<LaneAdmissionSource, AgentActionNotice>>;
  /** `source:action:reason` keys already announced, so each notice is sent once. */
  laneNoticesAnnounced?: Set<string>;
  info: AgentProcessInfo;
  /** Admission has been returned to an MCP caller. */
  spawnReplied?: boolean;
  /** CLI label was filled only to satisfy the record shape. */
  provisionalCli?: boolean;
  admissionTimer?: NodeJS.Timeout;
  /** Child process for CLI-based agents, null for SDK-based agents */
  process: ChildProcess | null;
  sdkHandle?: SdkHandle;
  /** Abort controller for SDK-based agents (null/undefined for CLI agents) */
  sdkAbortController?: AbortController;
  stdoutBuffer: string;
  stderrBuffer: string;
  /** Absent for a restored record, and for an agent whose watchdog is disabled. */
  timeoutHandle?: NodeJS.Timeout;
  /** Start of the current silence window, updated when adapter output arrives. */
  inactivitySinceMs?: number;
  /** Silence window this agent's watchdog uses, or undefined when disabled. */
  inactivityTimeoutMs?: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  truncated: boolean;
  /** Guard against double handleExit (error + exit events firing) */
  hasExited: boolean;
  /** Cleanup timer handle for TTL-based removal from map */
  cleanupHandle?: NodeJS.Timeout;
  /** Deferred `agent:exited` emit timer (GRACEFUL_EXIT_DELAY); cleared if the
   * agent is re-opened via continueConversation so a stale exit from the prior
   * turn can't clobber the running continuation. */
  exitEmitHandle?: NodeJS.Timeout;
  /** Idle-release timer armed at exit for continuation-capable handles; cleared
   * when a continuation re-opens the agent. */
  idleReleaseHandle?: NodeJS.Timeout;
  /** Wall-clock ms at which the current idle window started, for the release log. */
  idleSince?: number;
  /** True once the SDK subprocess has been aborted and reaped. The record and
   * its buffers stay readable; only in-process continuation is gone. */
  subprocessReleased: boolean;
  /** Accumulated structured segments for persistence (capped at MAX_ACCUMULATED_SEGMENTS) */
  accumulatedSegments: CliOutputSegment[];
  /** Usage reported for the current turn, retained even if output is capped. */
  outcomeUsage?: CliOutputSegment['usage'];
  /** Accumulated rich stream events for persistence (Ptah CLI only, capped at MAX_ACCUMULATED_STREAM_EVENTS) */
  accumulatedStreamEvents: FlatStreamEventUnion[];
  /** True once the stream-events cap has been logged — suppresses per-event log spam for long-running agents. */
  streamCapLogged: boolean;
  /**
   * Settles when the turn currently in flight has torn down. Written in
   * {@link AgentProcessManager.trackSdkHandle} from `SdkHandle.done` and
   * re-written in {@link AgentProcessManager.continueConversation} from the
   * continued turn's `done`. The `interrupt-resume` path awaits it: without it
   * the router re-enters `continueConversation` while the record is still
   * `running` and is refused as `busy`.
   */
  currentTurnDone?: Promise<number>;
  /**
   * Messages waiting for the current turn to end, in arrival order. In-memory,
   * capped at `MAX_PENDING_MESSAGES`, never persisted, and cleared when
   * the record's subprocess is released or the record is dropped.
   */
  pendingMessages: PendingAgentMessage[];
  /**
   * How many `ptah_agent_report` bodies this lane delivered. Carried on the
   * completion signal so the orchestrator can tell a lane that accounted for
   * itself from one that exited without a word (TASK_2026_515).
   */
  reportsDelivered: number;
  reportAttempts?: number;
  reportsFailed?: number;
  /** Authentication wording from the failed turn's bounded output. */
  authMatched?: boolean;
  /**
   * API rate-limit (HTTP 429) wording in this turn's bounded output, set in
   * `handleExit` before the output is discarded. In memory only; it is not
   * quota and never sets `failureKind`.
   */
  rateLimitMatched?: boolean;
  /**
   * Index into `accumulatedSegments` where the current turn's segments begin:
   * 0 at spawn, the segment count when a continuation starts. Keeps an
   * earlier turn's 429 out of a later turn's rate-limit match.
   */
  turnSegmentStart?: number;
  turnStartedAt?: string;
  /**
   * Tool calls the lane guard counted, saved when the guard is released so the
   * completion signal can still report them.
   */
  guardToolCalls?: number;
  /** Caller messages a host stop discarded from the queue. */
  queuedMessagesDropped?: number;
  /** Times the repeated call ran when the guard stopped the lane. */
  repeatedCalls?: number;
  /**
   * Set only by {@link AgentProcessManager.restoreAgents}: this record was
   * rebuilt from persisted session state, not from a run this host supervised.
   * Its output is readable; nothing about it is live.
   */
  restored?: true;
}

const PHASE_RANK: Readonly<Record<AgentActionNotice['action'], number>> = {
  'asked-handoff': 1,
  paused: 2,
  ended: 0,
};

/** The highest-phase notice across the lane's monitors: a pause wins over an ask. */
export function currentLaneNotice(tracked: Pick<TrackedAgent, 'laneAdmission'>): AgentActionNotice | undefined {
  let best: AgentActionNotice | undefined;
  for (const notice of Object.values(tracked.laneAdmission ?? {})) {
    if (notice && (!best || PHASE_RANK[notice.action] > PHASE_RANK[best.action])) best = notice;
  }
  return best;
}

/** True while any Ptah monitor holds the lane paused. */
export function isLanePaused(tracked: Pick<TrackedAgent, 'laneAdmission'>): boolean {
  return currentLaneNotice(tracked)?.action === 'paused';
}

/** Set or clear one monitor's notice and mirror the current notice onto `info.actionNotice`. */
export function setLaneAdmission(
  tracked: Pick<TrackedAgent, 'laneAdmission' | 'info'>,
  source: LaneAdmissionSource,
  notice: AgentActionNotice | undefined,
): void {
  const next = { ...(tracked.laneAdmission ?? {}) };
  if (notice) next[source] = notice;
  else delete next[source];
  tracked.laneAdmission = next;
  const current = currentLaneNotice(tracked);
  const info = { ...tracked.info };
  if (current) info.actionNotice = current;
  else delete info.actionNotice;
  tracked.info = info;
}

/**
 * Record a monitor's notice once. Returns true when this `source:action:reason` was not
 * announced before. A latched pause is never downgraded to an ask from the same monitor.
 */
export function announceLaneNotice(
  tracked: Pick<TrackedAgent, 'laneAdmission' | 'laneNoticesAnnounced' | 'info'>,
  source: LaneAdmissionSource,
  notice: AgentActionNotice,
): boolean {
  const latched = tracked.laneAdmission?.[source];
  if (latched && PHASE_RANK[latched.action] > PHASE_RANK[notice.action]) return false;
  setLaneAdmission(tracked, source, notice);
  const key = `${source}:${notice.action}:${notice.reason}`;
  const announced = (tracked.laneNoticesAnnounced ??= new Set<string>());
  if (announced.has(key)) return false;
  announced.add(key);
  return true;
}

/** Clear one monitor's notice and its announce keys, so a later crossing is announced again. */
export function clearLaneAdmission(
  tracked: Pick<TrackedAgent, 'laneAdmission' | 'laneNoticesAnnounced' | 'info'>,
  source: LaneAdmissionSource,
): void {
  for (const key of [...(tracked.laneNoticesAnnounced ?? [])]) {
    if (key.startsWith(`${source}:`)) tracked.laneNoticesAnnounced?.delete(key);
  }
  if (tracked.laneAdmission?.[source]) setLaneAdmission(tracked, source, undefined);
}
