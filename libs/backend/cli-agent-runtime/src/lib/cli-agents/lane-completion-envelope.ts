import type {
  AgentActionNotice,
  AgentActionReason,
  LaneCompletionSignal,
  LaneDeliverableCheck,
} from '@ptah-extension/shared';
import {
  formatAgentActionReason,
  formatAgentActorLabel,
  isAgentBudgetStopReason,
} from '@ptah-extension/shared';

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function duration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function deliverableLine(check: LaneDeliverableCheck): string {
  if (!check.exists) return `- ${check.path} — MISSING`;
  if ((check.bytes ?? 0) === 0) return `- ${check.path} — EMPTY`;
  const stale =
    check.writtenAfterSpawn === false ? ' (NOT written by this run)' : '';
  return `- ${check.path} — ${check.bytes} bytes${stale}`;
}

/**
 * Who stopped the lane and why, for a lane the host stopped. Decodes historical
 * stop reasons only: new code never stamps a budget or repeat-call stop.
 */
function hostStopLine(signal: LaneCompletionSignal): string | undefined {
  if (!signal.stopReason) return undefined;
  if (isAgentBudgetStop(signal))
    return `Stopped by Ptah (agent budget), not by the caller: ${signal.stopReason}; limit: ${signal.budgetLimit ?? 'configured limit'}.${signal.stopReason === 'budget' ? ' Budget warning: finish current work, report progress, and prepare a short handoff before a fresh lane.' : ''}`;
  const calls =
    signal.toolCalls !== undefined ? ` (${signal.toolCalls} tool calls)` : '';
  const why =
    signal.repeatedCalls !== undefined
      ? `repeated the same call ${signal.repeatedCalls} times`
      : 'repeated the same call';
  return `Stopped by Ptah: ${why}${calls}. The caller did not stop it.`;
}

/** Reasons whose pause outlives the lane: the lifetime ledger stays over its limit. */
const LEDGER_PAUSE_REASONS: ReadonlySet<AgentActionReason> = new Set<AgentActionReason>([
  'weighted-budget', 'raw-budget', 'context-budget', 'duration', 'telemetry-unavailable',
]);

/**
 * The lane's last Ptah notice, in the past tense: the lane has already returned, so it is
 * context for the parent, not a live state.
 */
function actionNoticeLine(notice: AgentActionNotice, agentId: string): string {
  const actor = formatAgentActorLabel(notice);
  const because = formatAgentActionReason(notice);
  if (notice.action === 'asked-handoff')
    return `Ptah notice: ${actor} asked ${agentId} for a handoff because ${because}. The lane has since returned; check that its report covers the remaining work.`;
  if (notice.action === 'paused') {
    const next = LEDGER_PAUSE_REASONS.has(notice.reason)
      ? 'A resume of this CLI session starts a fresh lane instead.'
      : 'Review its report before you resume it.';
    return `Ptah notice: ${actor} paused new work for ${agentId} because ${because}. The lane has since returned. ${next}`;
  }
  return `Ptah notice: ${actor} ended ${agentId} because ${because}.`;
}

function isAgentBudgetStop(signal: LaneCompletionSignal): boolean {
  return isAgentBudgetStopReason(signal.stopReason);
}

function nextAction(signal: LaneCompletionSignal): string {
  if (isAgentBudgetStop(signal))
    return 'Next: resume is refused for this CLI session. Read the progress pointer and deliverables, then start a fresh lane with the remaining work.';
  switch (signal.verdict) {
    case 'delivered':
      if (signal.stopReason) {
        return 'Next: Ptah stopped this lane before it finished, so its deliverable files may be only a skeleton or partly filled. Read them and treat any missing section as NOT done; resume the lane with the gaps named when a CLI Session ID is present.';
      }
      return 'Next: read the deliverable files and verify the work yourself. A lane writing its file is not proof the content is right.';
    case 'no-deliverable':
      return 'Next: this lane exited without writing every deliverable it was given, so treat the task as NOT done. Read its output with ptah_agent_read to see how far it got, then resume it with the missing paths named, or do the work another way. Do not report this lane as complete.';
    case 'failed':
      return 'Next: the lane did not finish. Read its output with ptah_agent_read, then resume it when a CLI Session ID is present or respawn with a smaller task.';
    case 'stopped':
      return 'Next: the lane was stopped on request before it finished, so treat its work as unfinished. Read its output with ptah_agent_read; resume it only if the user still wants the task done.';
    case 'unverified':
      return 'Next: read the lane output and check its claims against the files and the project tests before you use them.';
  }
}

export function buildLaneCompletionEnvelope(
  signal: LaneCompletionSignal,
): string {
  const attrs = [
    `agent-id="${escape(signal.agentId)}"`,
    `agent="${escape(signal.agentLabel)}"`,
    `cli="${escape(signal.cli)}"`,
    `status="${escape(signal.status)}"`,
    `verdict="${escape(signal.verdict)}"`,
    ...(signal.stopReason ? [`stop-reason="${escape(signal.stopReason)}"`] : []),
  ].join(' ');
  const lines: string[] = [
    `Lane ${signal.agentLabel} finished: ${signal.status}` +
      (signal.exitCode !== undefined ? ` (exit code ${signal.exitCode})` : '') +
      ` after ${duration(signal.durationMs)}.`,
    `Task: ${signal.taskHeadline || '(no task headline)'}`,
  ];
  const stopLine = hostStopLine(signal);
  if (stopLine) lines.push(stopLine);
  else if (signal.toolCalls !== undefined)
    lines.push(`Tool calls: ${signal.toolCalls}.`);
  if (signal.heldBudgetWarning && !isAgentBudgetStop(signal))
    lines.push('Budget warning: Ptah budget monitor asked this lane for a handoff, but the request had not reached the lane when it returned.');
  if (signal.queuedMessagesDropped)
    lines.push(
      `Queued messages dropped by the stop: ${signal.queuedMessagesDropped}. Send them again if they still matter.`,
    );
  if (signal.role) lines.push(`Role: ${signal.role}`);
  if (signal.mcpAttachmentWarning) lines.push(`MCP warning: ${signal.mcpAttachmentWarning}`);
  if (signal.taskFolder) lines.push(`Task folder: ${signal.taskFolder}`);
  if (signal.deliverables.length === 0) {
    lines.push(
      'Deliverables: none were declared at spawn, so nothing was checked. Read the lane output before you trust this result, and declare "deliverables" on the next spawn so the next signal can verify it.',
    );
  } else {
    lines.push('Deliverables:', ...signal.deliverables.map(deliverableLine));
  }
  lines.push(
    `Reports sent by this lane before it ended: ${signal.reportsDelivered}.`,
  );
  if (signal.cliSessionId)
    lines.push(isAgentBudgetStop(signal)
      ? `CLI Session ID: ${signal.cliSessionId} — resume is refused after this budget stop.`
      : `CLI Session ID: ${signal.cliSessionId} — pass it as resume_session_id to continue this lane instead of respawning it.`);
  if (isAgentBudgetStop(signal))
    lines.push(`Progress pointer: ${(signal.progressPointer ?? `CLI Session ID ${signal.cliSessionId ?? 'unavailable'}; inspect lane ${signal.agentId} output`).slice(0, 240)}`);
  // The latest action notice is context only: the lane's own ending is its cause.
  if (signal.actionNotice)
    lines.push(actionNoticeLine(signal.actionNotice, signal.agentId));
  lines.push(nextAction(signal));
  return `<agent-lane-completed ${attrs}>\n${lines.join('\n')}\n</agent-lane-completed>`;
}
