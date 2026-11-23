/**
 * Gateway tool approval ahead of SDK allow rules (TASK_2026_979, C5).
 *
 * The `ptah` MCP server also serves the user's own MCP servers (connectors,
 * intents, file-declared servers) as `mcp__ptah__<alias>__<tool>`. A settings
 * entry such as `mcp__ptah__*` would therefore run a third-party tool with no
 * prompt, which it never did when that tool was `mcp__<server>__<tool>`.
 * `PreToolUse` runs before the allow rules, so the held permission callback
 * also runs there for every gateway tool, and a deny from the hook wins over
 * any allow rule. The callback still applies stored rules, YOLO and the
 * permission mode, exactly as for a third-party MCP tool.
 *
 * Built like `createCronApprovalGate`: the decision of the hook is remembered
 * by tool-use id, so `canUseTool` does not ask a second time. `canUseTool`
 * delegates every other name to `next`, so this gate can wrap the cron gate.
 *
 * Fail-closed: a deny, a timeout, a callback with no decision or an error all
 * deny the call. A predicate that throws treats the name as a gateway tool.
 */
import type {
  CanUseTool,
  HookCallback,
  HookCallbackMatcher,
  HookJSONOutput,
  PermissionResult,
} from '../types/sdk-types/claude-sdk.types';

/**
 * Seconds the CLI waits on the held `PreToolUse` call. A hook that times out
 * gives no decision, which would let an allow rule run the call, so the hook
 * denies on its own deadline shortly before this limit.
 */
export const GATEWAY_APPROVAL_HOOK_TIMEOUT_SECONDS = 3600;
const HOOK_DEADLINE_MARGIN_MS = 30_000;
/**
 * Most remembered decisions. `canUseTool` removes an entry when it reads it,
 * but an SDK allow rule skips `canUseTool`, so the oldest entry goes when the
 * map is full. A lost entry only means that the user can be asked again.
 */
export const GATEWAY_APPROVAL_REMEMBERED_MAX = 32;

const PTAH_MCP_TOOL_PREFIX = 'mcp__ptah__';

/** Every tool of the `ptah` server; the hook itself picks the gateway ones. */
export const GATEWAY_APPROVAL_HOOK_MATCHER = 'mcp__ptah__.*';

export const GATEWAY_APPROVAL_TIMEOUT_MESSAGE =
  'Nobody answered the approval prompt for this MCP tool call in time, so the call was not run.';
export const GATEWAY_APPROVAL_FAILED_MESSAGE =
  'The approval prompt for this MCP tool call failed, so the call was not run.';

export interface GatewayApprovalGate {
  /** `canUseTool` that reuses a decision the hook already has. */
  readonly canUseTool: CanUseTool;
  /** `PreToolUse` matcher; put it ahead of the other `PreToolUse` hooks. */
  readonly hookMatcher: HookCallbackMatcher;
}

export interface GatewayApprovalGateOptions {
  /**
   * `IMcpGateway.isGatewayTool`: `true` for any name that is not a registered
   * host tool. Only `mcp__ptah__*` names are ever passed to it.
   */
  readonly isGatewayTool: (toolName: string) => boolean;
  /**
   * `canUseTool` for every non-gateway name (for example the cron gate).
   * Defaults to the held permission callback itself.
   */
  readonly next?: CanUseTool;
  /** Called when the prompt or the predicate throws; the call is denied. */
  readonly onError?: (error: unknown, toolName: string) => void;
  /** Test seam for the hook deadline. */
  readonly deadlineMs?: number;
}

function deny(reason: string): HookJSONOutput {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}

export function createGatewayApprovalGate(
  gate: CanUseTool,
  options: GatewayApprovalGateOptions,
): GatewayApprovalGate {
  const deadlineMs =
    options.deadlineMs ??
    GATEWAY_APPROVAL_HOOK_TIMEOUT_SECONDS * 1000 - HOOK_DEADLINE_MARGIN_MS;
  const next = options.next ?? gate;
  /** Decisions of the hook, by tool-use id, until `canUseTool` reads them. */
  const decided = new Map<string, Promise<PermissionResult>>();

  /** A `ptah` server tool that is not one of Ptah's own; fail-closed. */
  const isGatewayTool = (toolName: string): boolean => {
    if (!toolName.startsWith(PTAH_MCP_TOOL_PREFIX)) return false;
    try {
      return options.isGatewayTool(toolName);
    } catch (error: unknown) {
      // degradation-audit: reported - the owner logs through `onError`, and
      // the name is treated as a gateway tool, so the call is still prompted.
      options.onError?.(error, toolName);
      return true;
    }
  };

  const canUseTool: CanUseTool = async (toolName, input, context) => {
    if (!isGatewayTool(toolName)) return next(toolName, input, context);
    const known = decided.get(context.toolUseID);
    if (!known) return gate(toolName, input, context);
    decided.delete(context.toolUseID);
    return known;
  };

  const hook: HookCallback = async (hookInput, toolUseId, { signal }) => {
    if (
      hookInput.hook_event_name !== 'PreToolUse' ||
      !isGatewayTool(hookInput.tool_name)
    ) {
      return {};
    }
    const toolName = hookInput.tool_name;
    const id = hookInput.tool_use_id ?? toolUseId;
    const input = (hookInput.tool_input ?? {}) as Record<string, unknown>;
    const agentID = (hookInput as { agent_id?: unknown }).agent_id;
    // The prompt gets its own signal: the deadline aborts it, so no stale
    // prompt and no activity hold stay behind a call that was denied.
    const prompt = new AbortController();
    const abortPrompt = (): void => prompt.abort();
    if (signal.aborted) prompt.abort();
    else signal.addEventListener('abort', abortPrompt, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<PermissionResult>((resolve) => {
      timer = setTimeout(() => {
        // Decide first, then cancel: the timeout text wins over the result
        // that the cancelled prompt gives.
        resolve({
          behavior: 'deny',
          message: GATEWAY_APPROVAL_TIMEOUT_MESSAGE,
        });
        prompt.abort();
      }, deadlineMs);
    });
    let decision: Promise<PermissionResult | null>;
    try {
      decision = Promise.resolve(
        gate(toolName, input, {
          signal: prompt.signal,
          toolUseID: id ?? '',
          // No permission request exists yet at hook time; the id names this one.
          requestId: `gateway-approval:${id ?? 'unknown'}`,
          ...(typeof agentID === 'string' ? { agentID } : {}),
        }),
      );
    } catch (error: unknown) {
      // degradation-audit: reported - a synchronous throw becomes a rejection,
      // which the catch below reports through `onError` and turns into a deny.
      decision = Promise.reject(error);
    }
    const settled = Promise.race([decision, deadline])
      // A callback that gives no decision must not leave the call to an
      // allow rule.
      .then(
        (result): PermissionResult =>
          result ?? {
            behavior: 'deny',
            message: GATEWAY_APPROVAL_FAILED_MESSAGE,
          },
      )
      .catch((error: unknown): PermissionResult => {
        // degradation-audit: reported - the owner logs through `onError`, and
        // the call is denied: a failed prompt must never run a gateway tool.
        options.onError?.(error, toolName);
        return { behavior: 'deny', message: GATEWAY_APPROVAL_FAILED_MESSAGE };
      })
      .finally(() => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abortPrompt);
      });
    if (id) {
      decided.set(id, settled);
      if (decided.size > GATEWAY_APPROVAL_REMEMBERED_MAX) {
        const oldest = decided.keys().next().value;
        if (oldest !== undefined) decided.delete(oldest);
      }
    }
    const result = await settled;
    if (result.behavior === 'allow') return {};
    // A denied call never reaches `canUseTool`: drop the remembered decision.
    if (id) decided.delete(id);
    return deny(result.message);
  };

  return {
    canUseTool,
    hookMatcher: {
      matcher: GATEWAY_APPROVAL_HOOK_MATCHER,
      hooks: [hook],
      timeout: GATEWAY_APPROVAL_HOOK_TIMEOUT_SECONDS,
    },
  };
}
