import { z } from 'zod';
import type { Logger } from '@ptah-extension/vscode-core';
import type { HookCallbackMatcher, HookEvent } from '../../types/sdk-types/claude-sdk.types';
import type { SubagentBudgetMonitor } from './subagent-budget-monitor';

const base = z.object({
  hook_event_name: z.string(),
  session_id: z.string().optional(),
  agent_id: z.string().optional(),
  tool_name: z.string().optional(),
  tool_use_id: z.string().optional(),
  is_interrupt: z.boolean().optional(),
  tool_input: z.unknown().optional(),
});

/** Hook side of the cooperative exit. All input fields are parsed before use. */
export function createSubagentBudgetHooks(
  logger: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
  monitor: Pick<SubagentBudgetMonitor, 'checkNotesTool' | 'hasNotesGate' | 'finishWarnedAgent' | 'takeNormalHandoff' | 'takeInterruptedHandoff'>,
  capturedSessionId?: string,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  const events = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'SubagentStop', 'TaskCompleted'] as const;
  const result: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {};
  for (const event of events) {
    result[event] = [{ hooks: [async (input) => {
      const parsed = base.safeParse(input);
      if (!parsed.success || parsed.data.hook_event_name !== event) return { continue: true };
      const data = parsed.data;
      const relevant = event === 'SubagentStop' || event === 'TaskCompleted'
        || event === 'PostToolUseFailure'
        || (event === 'PostToolUse' && (data.tool_name === 'Agent' || data.tool_name === 'Task'));
      logger[relevant ? 'info' : 'debug']('[SubagentBudgetProbe]', {
        eventName: event, agentId: data.agent_id, toolName: data.tool_name,
        toolUseId: data.tool_use_id, isInterrupt: data.is_interrupt,
        timestamp: Date.now(),
      });
      const sessionId = data.session_id ?? capturedSessionId;
      if (!sessionId) {
        logger.warn('[SubagentBudgetHooks] Hook missing session id; allowing the call', {
          hasSessionId: false, eventName: event, agentId: data.agent_id, toolName: data.tool_name,
        });
        // Lifecycle hooks must pass; without a session id, this gate cannot identify a stopped target.
        return { continue: true };
      }
      try {
        if (event === 'PreToolUse' && data.tool_name) {
          const reason = await monitor.checkNotesTool(sessionId, data.agent_id, data.tool_name, data.tool_input);
          return reason ? { hookSpecificOutput: {
            hookEventName: 'PreToolUse' as const, permissionDecision: 'deny' as const,
            permissionDecisionReason: reason,
          } } : { continue: true };
        }
        if (event === 'SubagentStop' && data.agent_id) {
          await monitor.finishWarnedAgent(sessionId, data.agent_id);
        }
        if ((event === 'PostToolUse' || event === 'PostToolUseFailure') && !data.agent_id && data.tool_use_id && (data.tool_name === 'Agent' || data.tool_name === 'Task')) {
          const handoff = event === 'PostToolUse'
            ? monitor.takeNormalHandoff(sessionId, data.tool_use_id)
            : data.is_interrupt ? monitor.takeInterruptedHandoff(sessionId, data.tool_use_id) : undefined;
          if (handoff && event === 'PostToolUse') return { hookSpecificOutput: {
            hookEventName: 'PostToolUse' as const, additionalContext: handoff,
          } };
          if (handoff && event === 'PostToolUseFailure') return { hookSpecificOutput: {
            hookEventName: 'PostToolUseFailure' as const,
            additionalContext: "Ptah's token budget ended this subagent; not the user. The SDK's STOP and wait text does not apply. The handoff follows as a separate message.",
          } };
        }
      } catch (error: unknown) {
        logger.error('[SubagentBudgetHooks] Hook failed', {
          error: error instanceof Error ? error : new Error(String(error)), eventName: event,
          agentId: data.agent_id, toolUseId: data.tool_use_id,
        });
        if (event === 'PreToolUse' && monitor.hasNotesGate(data.agent_id)) {
          return { hookSpecificOutput: {
            hookEventName: 'PreToolUse' as const, permissionDecision: 'deny' as const,
            permissionDecisionReason: 'Ptah notes gate failed. End your turn now; do not call other tools.',
          } };
        }
      }
      return { continue: true };
    }] }];
  }
  return result;
}
