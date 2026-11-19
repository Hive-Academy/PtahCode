/**
 * Cron write approval ahead of SDK allow rules (issue #1400 Part 1).
 *
 * The SDK asks `canUseTool` only when no allow rule and no permission mode
 * decided the call first. A settings entry such as `mcp__ptah__*` would
 * therefore run a cron write with no prompt. `PreToolUse` runs before the
 * allow rules, so the same permission callback also runs there for the five
 * cron write tools. A deny from the hook wins over any allow rule.
 *
 * The decision of the hook is remembered by tool-use id. When the SDK still
 * reaches `canUseTool` for that call, the user is not asked a second time.
 */
import type {
  CanUseTool,
  HookCallback,
  HookCallbackMatcher,
  HookJSONOutput,
  PermissionResult,
} from '../types/sdk-types/claude-sdk.types';
import { isCronMutatingTool } from './cron-tool-policy';

/**
 * Seconds the CLI waits on the held `PreToolUse` call. A hook that times out
 * gives no decision, which would let an allow rule run the call, so the hook
 * denies on its own deadline shortly before this limit.
 */
export const CRON_APPROVAL_HOOK_TIMEOUT_SECONDS = 3600;
const HOOK_DEADLINE_MARGIN_MS = 30_000;
/**
 * Most remembered decisions. `canUseTool` removes an entry when it reads it,
 * but an SDK allow rule skips `canUseTool`, so the oldest entry goes when the
 * map is full. A lost entry only means that the user can be asked again.
 */
export const CRON_APPROVAL_REMEMBERED_MAX = 32;

/** Matches the five write tools and nothing the hook would not check itself. */
export const CRON_APPROVAL_HOOK_MATCHER = 'mcp__ptah__ptah_cron_.*';

export const CRON_APPROVAL_TIMEOUT_MESSAGE =
  'Nobody answered the approval prompt for this scheduled-job change in time, so the call was not run.';
export const CRON_APPROVAL_FAILED_MESSAGE =
  'The approval prompt for this scheduled-job change failed, so the call was not run.';

export interface CronApprovalGate {
  /** `canUseTool` that reuses a decision the hook already has. */
  readonly canUseTool: CanUseTool;
  /** `PreToolUse` matcher; put it ahead of the other `PreToolUse` hooks. */
  readonly hookMatcher: HookCallbackMatcher;
}

export interface CronApprovalGateOptions {
  /** Called when the prompt throws; the call is denied. */
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

export function createCronApprovalGate(
  gate: CanUseTool,
  options: CronApprovalGateOptions = {},
): CronApprovalGate {
  const deadlineMs =
    options.deadlineMs ??
    CRON_APPROVAL_HOOK_TIMEOUT_SECONDS * 1000 - HOOK_DEADLINE_MARGIN_MS;
  /** Decisions of the hook, by tool-use id, until `canUseTool` reads them. */
  const decided = new Map<string, Promise<PermissionResult>>();

  const canUseTool: CanUseTool = async (toolName, input, context) => {
    const known = isCronMutatingTool(toolName)
      ? decided.get(context.toolUseID)
      : undefined;
    if (!known) return gate(toolName, input, context);
    decided.delete(context.toolUseID);
    return known;
  };

  const hook: HookCallback = async (hookInput, toolUseId, { signal }) => {
    if (
      hookInput.hook_event_name !== 'PreToolUse' ||
      !isCronMutatingTool(hookInput.tool_name)
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
    const decision = gate(toolName, input, {
      signal: prompt.signal,
      toolUseID: id ?? '',
      // No permission request exists yet at hook time; the id names this one.
      requestId: `cron-approval:${id ?? 'unknown'}`,
      ...(typeof agentID === 'string' ? { agentID } : {}),
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<PermissionResult>((resolve) => {
      timer = setTimeout(() => {
        // Decide first, then cancel: the timeout text wins over the result
        // that the cancelled prompt gives.
        resolve({ behavior: 'deny', message: CRON_APPROVAL_TIMEOUT_MESSAGE });
        prompt.abort();
      }, deadlineMs);
    });
    const settled = Promise.race([decision, deadline])
      // The cron branch of the permission callback always decides. A callback
      // that gives no decision must not leave the call to an allow rule.
      .then(
        (result): PermissionResult =>
          result ?? { behavior: 'deny', message: CRON_APPROVAL_FAILED_MESSAGE },
      )
      .catch((error: unknown): PermissionResult => {
        // degradation-audit: reported - the owner logs through `onError`, and
        // the call is denied: a failed prompt must never run a cron write.
        options.onError?.(error, toolName);
        return { behavior: 'deny', message: CRON_APPROVAL_FAILED_MESSAGE };
      })
      .finally(() => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abortPrompt);
      });
    if (id) {
      decided.set(id, settled);
      if (decided.size > CRON_APPROVAL_REMEMBERED_MAX) {
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
      matcher: CRON_APPROVAL_HOOK_MATCHER,
      hooks: [hook],
      timeout: CRON_APPROVAL_HOOK_TIMEOUT_SECONDS,
    },
  };
}
