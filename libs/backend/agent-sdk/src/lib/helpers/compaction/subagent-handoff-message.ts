/**
 * The texts of the subagent budget monitor: the near-budget warning a
 * subagent gets, and the parent message sent when it stops a subagent: who
 * stopped it (Ptah's monitor, not the user) and why, and everything a fresh
 * subagent of the same type and name needs to continue. With a handoff
 * record (`subagent-handoff-record.ts`) the second line names it, and the
 * fresh subagent's instruction repeats that line.
 */
import type { HandoffFileState } from './subagent-handoff-files';

/** Why the monitor stopped a subagent. */
export type StopReason = 'handoff' | 'safety';

/**
 * Who the handoff names (the registry record when there is one, else
 * `task_started`) and the SDK task it ran as.
 */
export interface HandoffSubject {
  readonly agentId?: string;
  readonly agentType: string;
  readonly teammateName?: string;
  /** The SDK task id the stop used. */
  readonly taskId: string;
  /** The task's output file, when its spawning tool result already named it. */
  readonly outputFile?: string;
}

/** The stopped subagent's usage and the limit it reached. */
export interface HandoffUsage {
  readonly reason: StopReason;
  readonly contextTokens: number;
  readonly weightedUsed: number;
  readonly handoffTokens: number;
  readonly stopWeightedTokens: number;
}

export interface HandoffProgress {
  readonly lastAssistantText?: string;
  readonly filePaths: readonly string[];
  readonly toolCalls: readonly { readonly name: string; readonly targetPath?: string; readonly outcome: 'started' | 'completed' | 'failed' }[];
  readonly transcriptPath?: string;
}

/**
 * The one notice a subagent gets near its handoff size: write progress notes
 * to `notesPath` now (the same path the hard-stop handoff names), then go on.
 */
export function nearBudgetWarning(
  contextTokens: number,
  handoffTokens: number,
  notesPath: string,
  taskId?: string,
): string {
  return (
    `Ptah budget notice: your context is at ${contextTokens} tokens, close to ` +
    `the ${handoffTokens}-token limit at which Ptah's subagent budget monitor ` +
    `ends this subagent. Task id: ${taskId ?? 'unknown'}. Before your next step, ` +
    `write or UPDATE your progress notes at ${notesPath} (create its directory ` +
    `if needed; overwrite a stub): current ` +
    `state, findings, decisions and their reasons, files touched, and the exact ` +
    `next steps. Then end your turn with a final message that starts ` +
    `"PTAH BUDGET HANDOFF:" and summarizes progress and next steps. ` +
    `Do not call other tools. A fresh subagent continues from that file.`
  );
}

/** Summary for the SDK task notification when Ptah invoked the stop. */
export function stopNotice(
  subject: HandoffSubject,
  usage: HandoffUsage,
  recordPath?: string,
): string {
  const name = subject.teammateName
    ? `\`${subject.agentType}\` ('${subject.teammateName}')`
    : `\`${subject.agentType}\``;
  const why =
    usage.reason === 'handoff'
      ? `context reached the handoff size (${usage.contextTokens} of ${usage.handoffTokens} tokens)`
      : `weighted tokens reached the safety limit (${Math.round(usage.weightedUsed)} of ${usage.stopWeightedTokens} tokens)`;
  return (
    `Ptah's budget monitor stopped ${name} at its budget: ${why}. ` +
    `Usage: ${usage.contextTokens} context tokens of ${usage.handoffTokens}; ` +
    `${Math.round(usage.weightedUsed)} weighted tokens of ${usage.stopWeightedTokens}. ` +
    `Reason: ${usage.reason}. Record: ${recordPath ?? 'unknown'}. The user did not stop it. ` +
    `It cannot be resumed; start a fresh agent with a handoff. ` +
    `Its partial output is in the transcript.`
  );
}

/** The line that names a handoff record and how to resolve it. */
function recordLine(recordPath: string): string {
  return (
    `This handoff is saved at \`${recordPath}\`. Read it, continue from it, ` +
    `then set \`status: consumed\` in its frontmatter (or \`status: dismissed\` ` +
    `if you will not continue it).`
  );
}

export function handoffMessage(
  subject: HandoffSubject,
  usage: HandoffUsage,
  taskText: string | undefined,
  files: HandoffFileState,
  recordPath?: string,
  progress?: HandoffProgress,
): string {
  const name = subject.teammateName
    ? `\`${subject.agentType}\` ('${subject.teammateName}')`
    : `\`${subject.agentType}\``;
  const why =
    usage.reason === 'handoff'
      ? `at ${usage.contextTokens} context tokens (handoff limit ${usage.handoffTokens} tokens)`
      : usage.contextTokens >= usage.handoffTokens * 2
        ? `after ${usage.contextTokens} context tokens (2x handoff ceiling ${usage.handoffTokens * 2})`
        : `after ${Math.round(usage.weightedUsed)} weighted tokens (safety limit ${usage.stopWeightedTokens})`;
  const { paths, taskSaved, notesWritten, notesInferred, unavailable } = files;
  const lines = [
    `Ptah's subagent budget monitor handed off subagent ${name} ${why}. ` +
      `If the Agent result says "[Request interrupted by user for tool use]", Ptah's subagent budget monitor caused that interruption, not the user. ` +
      `No user input is needed; continue autonomously now.`,
  ];
  lines.push(`Budget stop reason: ${usage.reason}; SDK agent: ${subject.agentId ?? 'unknown'}; SDK task: ${subject.taskId}.`);
  lines.push(`Usage: ${usage.contextTokens} context tokens of ${usage.handoffTokens}; ${Math.round(usage.weightedUsed)} weighted tokens of ${usage.stopWeightedTokens}.`);
  if (recordPath) {
    lines.push(recordLine(recordPath));
  }
  lines.push(
    `If a Read or Glob right after this handoff fails with "The user doesn't want to take this action right now" ` +
      `and you saw no permission prompt the user declined, retry that call once; ` +
      `if it fails the same way, stop and report to the user.`,
  );
  if (taskText) {
    lines.push(`Its task was: ${taskText}`);
  }
  lines.push('Observed progress (from the monitor):');
  lines.push(`Last assistant text: ${progress?.lastAssistantText ?? 'unknown'}`);
  lines.push(`Files targeted: ${progress?.filePaths.length ? progress.filePaths.join(', ') : 'unknown'}`);
  lines.push(`Recent tools: ${progress?.toolCalls.length ? progress.toolCalls.map((call) => `${call.name}${call.targetPath ? ` (${call.targetPath})` : ''}: ${call.outcome}`).join('; ') : 'unknown'}`);
  lines.push(`Subagent transcript: ${progress?.transcriptPath ?? 'unknown'}`);
  const taskSource = paths && taskSaved
    ? `the remaining items from its original task prompt at ${paths.task}`
    : 'only the remaining items from its original Agent task';
  lines.push(
    !paths
      ? 'Its progress notes file: unavailable (workspace unknown).'
      : unavailable
        ? `Its progress notes file: unavailable (the file check did not finish); look for ${paths.notes}.`
        : notesWritten
          ? `Its progress notes${notesInferred ? ' (host-generated, inferred)' : ''} are at ${paths.notes}.`
          : `Its progress notes file is missing: ${paths.notes} was not written.`,
  );
  lines.push(
    subject.outputFile
      ? `Its output so far is in ${subject.outputFile} (task ${subject.taskId}).`
      : `Its output file: not yet known; it is in the task notification for task ${subject.taskId}.`,
  );
  const fresh = subject.teammateName
    ? `a fresh \`${subject.agentType}\` subagent named '${subject.teammateName}'`
    : `a fresh \`${subject.agentType}\` subagent`;
  const resumeFiles =
    paths && unavailable
      ? `If ${paths.notes} exists, read it first and continue from it; otherwise check the files the stopped subagent changed. Do not redo finished work.`
      : paths && notesWritten
        ? `Read ${paths.notes} first and continue from it; do not redo finished work.`
        : 'Check the files the stopped subagent changed and continue from them; do not redo finished work.';
  const resume = recordPath
    ? `${resumeFiles} ${recordLine(recordPath)}`
    : resumeFiles;
  lines.push(
    `If its task is not finished, spawn ${fresh} with a SMALLER scope: ${taskSource}, split into parts if needed. Never relaunch the same full task. ` +
      `Give the replacement this instruction: "${resume}"`,
  );
  lines.push('Continue unfinished work autonomously now. Do not ask the user or wait for another turn. If replacement subagents repeatedly hit this budget, finish the remaining work yourself or summarize the limit.');
  return lines.join('\n');
}
