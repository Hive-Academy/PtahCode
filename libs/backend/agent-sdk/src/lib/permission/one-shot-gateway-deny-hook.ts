/**
 * Gateway tool denial for one-shot runs (TASK_2026_979).
 *
 * A one-shot run that did not opt in to connectors must not call a gateway
 * tool (the user's own MCP servers that `ptah` serves), even under
 * `bypassPermissions`: a deny from `PreToolUse` wins over that mode. The
 * gateway rejects the same calls on its own, so this is the client-side half.
 * A run with the opt-in is unattended by design and gets no hook.
 */
import {
  hasPtahMcpToolPrefix,
  PTAH_MCP_TOOL_PREFIX,
  type IMcpGateway,
} from '@ptah-extension/platform-core';
import type { Logger } from '@ptah-extension/vscode-core';
import type {
  HookCallback,
  HookCallbackMatcher,
} from '../types/sdk-types/claude-sdk.types';

/** Every tool of the `ptah` server; the hook itself picks the gateway ones. */
const ONE_SHOT_GATEWAY_HOOK_MATCHER = `${PTAH_MCP_TOOL_PREFIX}.*`;
const ONE_SHOT_CONNECTORS_DISABLED_MESSAGE =
  'connectors are not enabled for this run';

/**
 * The `PreToolUse` matcher that denies every gateway tool. A predicate that
 * throws counts as a gateway tool.
 */
export function oneShotGatewayDenyHook(
  isGatewayTool: (toolName: string) => boolean,
  onError?: (error: unknown, toolName: string) => void,
): HookCallbackMatcher {
  const hook: HookCallback = async (hookInput) => {
    if (hookInput.hook_event_name !== 'PreToolUse') return {};
    const toolName = hookInput.tool_name;
    if (!hasPtahMcpToolPrefix(toolName)) return {};
    let gatewayTool = true;
    try {
      gatewayTool = isGatewayTool(toolName);
    } catch (error: unknown) {
      // degradation-audit: reported - the owner logs through `onError`, and
      // the name is denied: the safe answer for a run with no opt-in.
      onError?.(error, toolName);
    }
    if (!gatewayTool) return {};
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: ONE_SHOT_CONNECTORS_DISABLED_MESSAGE,
      },
    };
  };
  return { matcher: ONE_SHOT_GATEWAY_HOOK_MATCHER, hooks: [hook] };
}

/**
 * The deny matcher for a run, or `undefined` when no gateway is bound or the
 * run opted in to connectors. A failed predicate is logged at warn.
 */
export function oneShotGatewayDenyHookFor(
  gateway: Pick<IMcpGateway, 'isGatewayTool'> | undefined,
  includeConnectors: boolean,
  logger: Pick<Logger, 'warn'>,
  serviceTag: string,
): HookCallbackMatcher | undefined {
  if (!gateway || includeConnectors) return undefined;
  return oneShotGatewayDenyHook(
    (toolName) => gateway.isGatewayTool(toolName),
    (error, toolName) =>
      logger.warn(`${serviceTag} Gateway tool check failed; denying the call`, {
        toolName,
        error: error instanceof Error ? error.message : String(error),
      }),
  );
}
