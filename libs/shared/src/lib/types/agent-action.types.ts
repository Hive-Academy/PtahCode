/**
 * Cooperative agent handoff vocabulary (TASK_2026_2297_920a, phase P1).
 *
 * Crossing a budget threshold asks an agent to hand off, and a higher ceiling pauses new
 * tool calls. Nothing here ends an execution by force. These types and the message
 * builders are host-neutral: they carry no host, SDK or runtime types.
 *
 * Every value interpolated into a message must come from a trusted source (an ID the host
 * issued, a number, an approved workspace-relative path). Never pass provider text, raw
 * errors or endpoint details into a builder.
 */

export type AgentActionActor = 'ptah-budget' | 'ptah-watchdog' | 'ptah-host' | 'provider' | 'user';

export type AgentAction = 'asked-handoff' | 'paused' | 'ended';

export type AgentActionReason =
  | 'context-budget'
  | 'weighted-budget'
  | 'raw-budget'
  | 'duration'
  | 'telemetry-unavailable'
  | 'notes-overdue'
  | 'handoff-record-unavailable'
  | 'runtime-cap'
  | 'succession-limit'
  | 'successor-start-failed'
  | 'session-budget'
  | 'handoff-complete'
  | 'repeat-call'
  | 'lane-inactive'
  | 'tool-gate-unavailable'
  | 'provider-no-response'
  | 'provider-input-closed'
  | 'compaction-overdue'
  | 'permission-cancelled'
  | 'permission-timeout'
  | 'identity-unavailable'
  | 'user-stop'
  | 'host-shutdown';

export type AgentNextStep =
  | 'write-notes-and-return'
  | 'return-report'
  | 'review-live-agent'
  | 'continue-from-handoff'
  | 'retry-first-turn'
  | 'review-and-resume'
  | 'review-permission'
  | 'none';

export interface AgentActionNotice {
  readonly actor: AgentActionActor;
  readonly action: AgentAction;
  readonly reason: AgentActionReason;
  readonly nextStep: AgentNextStep;
  readonly measured?: number;
  readonly limit?: number;
  readonly unit?: 'tokens' | 'milliseconds' | 'calls' | 'turns';
}

export interface AgentHandoffResult {
  readonly executionId: string;
  readonly notice: AgentActionNotice & { action: 'ended'; reason: 'handoff-complete' };
  readonly notesPath?: string;
  readonly recordPath?: string;
  readonly recordState: 'written' | 'unavailable';
  readonly successorId?: string;
}

/** Trusted values a message template may interpolate besides the notice itself. */
export interface AgentActionMessageContext {
  /** Approved workspace-relative notes path. Selects the writable ask when present. */
  readonly notesPath?: string;
  /** Trusted execution, agent or lane ID. */
  readonly id?: string;
  /** Tool name from the permission request. */
  readonly tool?: string;
  /** Pointer to the handoff record or report. */
  readonly pointer?: string;
  /** Audience of a `paused` notice: the paused agent itself or its parent and the UI. */
  readonly audience?: 'agent' | 'parent';
  /** The paused agent can only use Read, Grep and Glob. */
  readonly readOnly?: boolean;
}

const MS_PER_MINUTE = 60_000;

function count(value: number | undefined): string | undefined {
  return value !== undefined && Number.isFinite(value) ? String(Math.round(value)) : undefined;
}

/** Duration measurements are stored in milliseconds and spoken in minutes. */
function minutes(value: number | undefined, unit: AgentActionNotice['unit']): string | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return String(Math.round(unit === 'milliseconds' ? value / MS_PER_MINUTE : value));
}

function tokenFragment(subject: string, notice: AgentActionNotice): string {
  const measured = count(notice.measured);
  const limit = count(notice.limit);
  if (measured === undefined) return `${subject} reached its token limit`;
  return limit === undefined
    ? `${subject} reached ${measured} tokens`
    : `${subject} reached ${measured} of ${limit} tokens`;
}

function runtimeFragment(notice: AgentActionNotice): string {
  const measured = minutes(notice.measured, notice.unit);
  return measured === undefined ? 'runtime reached its limit' : `runtime reached ${measured} minutes`;
}

/**
 * Allowlisted reason fragment for a notice. The returned text completes the sentence
 * "... because {fragment}." and never contains provider text or raw errors.
 */
export function formatAgentActionReason(notice: AgentActionNotice): string {
  switch (notice.reason) {
    case 'context-budget':
      return tokenFragment('context', notice);
    case 'weighted-budget':
      return tokenFragment('weighted lifetime usage', notice);
    case 'raw-budget':
      return tokenFragment('raw lifetime usage', notice);
    case 'duration':
    case 'runtime-cap':
      return runtimeFragment(notice);
    case 'telemetry-unavailable': {
      const measured = count(notice.measured);
      return measured === undefined
        ? 'usage telemetry was unavailable'
        : `usage telemetry was unavailable for ${measured} consecutive turns`;
    }
    case 'repeat-call': {
      const measured = count(notice.measured);
      return measured === undefined
        ? 'the same tool call repeated within one turn'
        : `the same tool call repeated ${measured} times in one turn`;
    }
    case 'lane-inactive': {
      const measured = minutes(notice.measured, notice.unit);
      return measured === undefined
        ? 'the configured lane output wait expired'
        : `the lane produced no output for ${measured} minutes`;
    }
    case 'succession-limit':
      return 'the succession allowance is exhausted';
    case 'successor-start-failed':
      return 'the successor could not start';
    case 'session-budget':
      return 'the session budget was reached';
    case 'notes-overdue':
      return 'the handoff notes are overdue';
    case 'handoff-record-unavailable':
      return 'the handoff record could not be saved';
    case 'handoff-complete':
      return 'the handoff completed';
    case 'tool-gate-unavailable':
      return 'no verified tool gate is available';
    case 'provider-no-response':
      return 'the provider sent no response';
    case 'provider-input-closed':
      return 'the provider input channel closed';
    case 'compaction-overdue':
      return 'compaction is overdue';
    case 'permission-cancelled':
      return 'the permission request was cancelled';
    case 'permission-timeout':
      return 'the permission request expired';
    case 'identity-unavailable':
      return 'the lane identity was unavailable';
    case 'user-stop':
      return 'the user stopped the session';
    case 'host-shutdown':
      return 'the host is shutting down';
  }
}

const FALLBACK_ID = 'the agent';
const FALLBACK_TOOL = 'the tool';
const FALLBACK_POINTER = 'its final report in the execution transcript';

/** Ptah label for the monitor that acted: the lane watchdog or the budget monitor. */
export function formatAgentActorLabel(notice: AgentActionNotice): string {
  return notice.actor === 'ptah-watchdog' ? 'Ptah watchdog' : 'Ptah budget monitor';
}

/** Budget ask, writable. */
export function formatBudgetAskWritable(notice: AgentActionNotice, notesPath: string): string {
  return `${formatAgentActorLabel(notice)} asked for a handoff because ${formatAgentActionReason(notice)}. Finish the current step, write progress and remaining work to ${notesPath}, then return normally.`;
}

/** Budget ask, read-only role or notes path unavailable. */
export function formatBudgetAskReadOnly(notice: AgentActionNotice): string {
  return `${formatAgentActorLabel(notice)} asked for a handoff because ${formatAgentActionReason(notice)}. Finish the current step and return your progress, findings, and remaining work in your final report.`;
}

/** Budget ceiling deny, for a role that may write handoff notes. */
export function formatBudgetCeilingDeny(notice: AgentActionNotice): string {
  return `${formatAgentActorLabel(notice)} paused new work tools because ${formatAgentActionReason(notice)}. Use only the permitted handoff tools, then return normally.`;
}

/** Budget ceiling deny, for a read-only role. */
export function formatBudgetReadOnlyCeilingDeny(notice: AgentActionNotice): string {
  return `${formatAgentActorLabel(notice)} paused new work tools because ${formatAgentActionReason(notice)}. You may use your permitted Read, Grep, and Glob tools and return your findings in your final report.`;
}

/** Parent and UI copy for a paused execution. */
export function formatBudgetPauseNotice(notice: AgentActionNotice, id: string): string {
  return `${formatAgentActorLabel(notice)} paused new work for ${id} because ${formatAgentActionReason(notice)}. The execution remains live. Review its progress and decide how it should continue.`;
}

/** Parent and UI copy for a paused lane whose CLI cannot block its own tool calls. */
export function formatLaneToolGateUnavailable(notice: AgentActionNotice, id: string): string {
  return `${formatAgentActorLabel(notice)} paused new work for ${id} because ${formatAgentActionReason(notice)}. This CLI has no verified tool gate and may still be running tools. Review its progress and decide whether to let it finish or stop it explicitly.`;
}

/** The handoff is still outstanding after the overdue window (10 minutes). */
export function formatHandoffNotesDelay(id: string): string {
  return `Ptah budget monitor is still waiting for ${id} to return its handoff after 10 minutes. The execution remains live. Review its progress.`;
}

/** The agent returned normally after a handoff request. */
export function formatHandoffNormalReturn(id: string, pointer: string): string {
  return `${id} returned normally after a Ptah budget monitor handoff request. Continue from ${pointer}.`;
}

/** The handoff record could not be written. */
export function formatHandoffRecordFailure(id: string): string {
  return `Ptah could not save the handoff record for ${id}. Continue from its final report in the execution transcript.`;
}

/** A pending permission request was closed by the host, not by the user. */
export function formatPermissionTeardown(tool: string, notice: AgentActionNotice): string {
  return `Ptah host closed the permission request for ${tool} because ${formatAgentActionReason(notice)}. Review the session state before retrying.`;
}

/** A pending permission request expired. */
export function formatPermissionExpired(tool: string): string {
  return `Ptah host denied ${tool} because its permission request expired. Request permission again if the tool is still needed.`;
}

/** A lane permission request could not be attributed before its deadline. */
export function formatUnattachedLaneIdentity(tool: string): string {
  return `Ptah host denied ${tool} because the lane identity was unavailable before the permission deadline. Return a report if the tool remains unavailable.`;
}

/** Context recorded for the turn after an explicit user stop. */
export function formatExplicitUserStopContext(): string {
  return 'Ptah recorded an explicit user stop for the previous turn. Review the current state before repeating any interrupted work.';
}

/**
 * Render the message for a notice. The template is selected from the reason, the action and
 * the context. A missing context value falls back to a neutral phrase rather than an empty
 * string, so a caller that omits it still sends a complete sentence.
 */
export function formatAgentActionNotice(
  notice: AgentActionNotice,
  context: AgentActionMessageContext = {},
): string {
  switch (notice.reason) {
    case 'notes-overdue':
      return formatHandoffNotesDelay(context.id ?? FALLBACK_ID);
    case 'handoff-record-unavailable':
      return formatHandoffRecordFailure(context.id ?? FALLBACK_ID);
    case 'handoff-complete':
      return formatHandoffNormalReturn(context.id ?? FALLBACK_ID, context.pointer ?? FALLBACK_POINTER);
    case 'permission-timeout':
      return formatPermissionExpired(context.tool ?? FALLBACK_TOOL);
    case 'identity-unavailable':
      return formatUnattachedLaneIdentity(context.tool ?? FALLBACK_TOOL);
    case 'permission-cancelled':
    case 'host-shutdown':
      return formatPermissionTeardown(context.tool ?? FALLBACK_TOOL, notice);
    case 'user-stop':
      return formatExplicitUserStopContext();
    case 'tool-gate-unavailable':
      return formatLaneToolGateUnavailable(notice, context.id ?? FALLBACK_ID);
    default:
      break;
  }
  if (notice.action === 'asked-handoff') {
    return context.notesPath !== undefined && !context.readOnly
      ? formatBudgetAskWritable(notice, context.notesPath)
      : formatBudgetAskReadOnly(notice);
  }
  if (notice.action === 'paused') {
    if (context.audience === 'parent') return formatBudgetPauseNotice(notice, context.id ?? FALLBACK_ID);
    return context.readOnly ? formatBudgetReadOnlyCeilingDeny(notice) : formatBudgetCeilingDeny(notice);
  }
  // An `ended` notice outside the P1 table (later phases add their own templates).
  return `Ptah recorded that ${context.id ?? FALLBACK_ID} ended because ${formatAgentActionReason(notice)}.`;
}
