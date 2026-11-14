/**
 * The completion contract every lane is given (TASK_2026_515).
 *
 * One text, two prompt-assembly points, because a lane's prompt is built in
 * two different places and a second copy of these words would drift:
 *
 *  - `buildTaskPrompt` (`cli-adapters/cli-adapter.utils.ts`) — every rival CLI
 *    adapter.
 *  - the `ptahCliId` branch of `agent-namespace.builder.ts` — Ptah CLI lanes,
 *    whose task string is handed to the SDK verbatim and never passes through
 *    `buildTaskPrompt`.
 *
 * The contract asks the lane to write its deliverable before exit. The notifier
 * checks the file. Reports are for blockers, questions, partial work and
 * decisions that need parent action.
 */

import { PTAH_MCP_TOOL_GUIDANCE } from './ptah-mcp-tool-guidance.constant';

export const LANE_PLAN_MODE_INSTRUCTION = 'This lane runs in Plan mode (read-only). Do not wait for approval. If the task needs file writes, stop and say "BLOCKED: plan mode" with the reason in your final message.';

export interface LaneCompletionContractInput {
  readonly effectivePermission?: string;
  readonly canUsePtahMcp?: boolean;
  readonly taskFolder?: string;
  readonly deliverables?: readonly string[];
}

/**
 * Render the block appended to a lane's prompt. Returns `''` when there is
 * nothing to say, so a caller can concatenate unconditionally.
 */
export function renderLaneCompletionContract(
  input: LaneCompletionContractInput,
): string {
  const { taskFolder, deliverables = [] } = input;
  const lines: string[] = ['## Before you exit'];
  if (input.effectivePermission === 'plan') {
    lines.push(LANE_PLAN_MODE_INSTRUCTION);
  }

  if (deliverables.length > 0) {
    lines.push(
      'Write every one of these files before your final message. The session ' +
        'that spawned you checks each path the moment you exit, and a clean ' +
        'exit with a missing or empty file is reported as work NOT done:',
      ...deliverables.map((path) => `- ${path}`),
    );
  } else if (taskFolder) {
    lines.push(
      `Write your deliverable under ${taskFolder} before your final message.`,
    );
  } else {
    lines.push(
      'State your deliverable in your final message before you exit.',
    );
  }

  lines.push(
    input.canUsePtahMcp === false
      ? 'Put what you produced, the absolute path of each file, and anything you could not do in your final message; Ptah MCP reporting is unavailable.'
      : PTAH_MCP_TOOL_GUIDANCE + '\nCall `ptah_agent_report` only for blockers, partial work, open decisions, questions, or progress the parent must act on. A clean success needs no report: the completion signal and deliverable file cover it. If a closing success report is sent, set `final: true`; it may be held for completion. Keep the final-message summary.',
    'Never end a turn claiming success for a file you did not write.',
  );

  return lines.join('\n');
}
