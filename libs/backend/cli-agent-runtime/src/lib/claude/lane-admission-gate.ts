import { formatBudgetCeilingDeny } from '@ptah-extension/shared';
import type {
  CanUseTool,
  HookCallback,
  HookJSONOutput,
  Options,
} from '@ptah-extension/agent-sdk';
import type { LaneToolGate } from '../cli-agents/cli-adapters/cli-adapter.interface';

/**
 * Tools a paused Claude lane keeps: the read-only set and the Ptah report tool,
 * so the lane can finish its findings and report them.
 */
export const LANE_GATE_PERMITTED_TOOLS: readonly string[] = [
  'Read',
  'Grep',
  'Glob',
  'mcp__ptah__ptah_agent_report',
];

/** Ptah-labeled deny text while the gate reports a notice, else `undefined`. */
export function laneToolGateDenial(
  gate: LaneToolGate,
  toolName: string,
): string | undefined {
  if (LANE_GATE_PERMITTED_TOOLS.includes(toolName)) return undefined;
  const notice = gate();
  return notice ? formatBudgetCeilingDeny(notice) : undefined;
}

/**
 * Wraps one `canUseTool` callback. While paused a new tool call is denied
 * without interrupting the turn; otherwise the wrapped callback decides.
 */
export function gateLaneCanUseTool(
  canUseTool: CanUseTool,
  gate: LaneToolGate,
): CanUseTool {
  return async (toolName, input, context) => {
    const message = laneToolGateDenial(gate, toolName);
    return message
      ? { behavior: 'deny', message, interrupt: false }
      : canUseTool(toolName, input, context);
  };
}

/**
 * Adds the lane pause gate to Claude SDK options. It only adds denials:
 *
 * - A `PreToolUse` hook denies every new tool call outside the permitted set
 *   while `gate()` returns a notice. Hooks run before permission modes and
 *   allow rules, so this also holds under `bypassPermissions` (lane yolo),
 *   where `canUseTool` is never consulted.
 * - An existing `canUseTool` is wrapped the same way. Options without one
 *   (yolo) get none, so callers that install routing on a missing callback
 *   keep doing so.
 *
 * Existing hooks and the permission flow are kept; when the gate is open the
 * hook returns no decision. Without a gate the options are returned as is.
 */
export function withLaneToolGate(
  options: Options,
  gate: LaneToolGate | undefined,
): Options {
  if (!gate) return options;
  const hook: HookCallback = async (input): Promise<HookJSONOutput> => {
    if (input.hook_event_name !== 'PreToolUse') return {};
    const reason = laneToolGateDenial(gate, input.tool_name);
    return reason
      ? {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: reason,
          },
        }
      : {};
  };
  const canUseTool = options.canUseTool;
  return {
    ...options,
    ...(canUseTool && { canUseTool: gateLaneCanUseTool(canUseTool, gate) }),
    hooks: {
      ...options.hooks,
      PreToolUse: [{ hooks: [hook] }, ...(options.hooks?.PreToolUse ?? [])],
    },
  };
}
