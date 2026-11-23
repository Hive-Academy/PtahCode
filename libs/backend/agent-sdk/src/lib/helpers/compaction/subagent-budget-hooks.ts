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
  tool_response: z.unknown().optional(),
});

/** Fixed Ptah-labeled deny used when the gate cannot answer for a paused agent. */
const PAUSED_GATE_FAILURE_REASON = 'Ptah budget monitor paused new work tools. Use only the permitted handoff tools, then return normally.';

/** The gate state the hooks need to decide whether a failure fails open or closed. */
interface NotesGatePhaseSource {
  /** Gate phase per SDK agent id; `asked` never denies, `paused` denies new work tools. */
  readonly notesGatePhase?: (agentId: string | undefined, sessionId?: string) => 'asked' | 'paused' | undefined;
}

type HookMonitor = Pick<SubagentBudgetMonitor, 'checkNotesTool' | 'hasNotesGate' | 'finishWarnedAgent' | 'takeNormalHandoff'>
  & Partial<Pick<SubagentBudgetMonitor, 'recordNotesToolResult' | 'takeInterruptedHandoff'>>
  & NotesGatePhaseSource;

function preToolDeny(reason: string) {
  return { hookSpecificOutput: {
    hookEventName: 'PreToolUse' as const, permissionDecision: 'deny' as const,
    permissionDecisionReason: reason,
  } };
}

/**
 * Hook side of the cooperative handoff. All input fields are parsed before use.
 * A gate or hook failure fails open while the agent is only being asked, and
 * closed (a Ptah-labeled deny) once the ceiling paused new work tools.
 */
export function createSubagentBudgetHooks(
  logger: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
  monitor: HookMonitor,
  capturedSessionId?: string,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  if (!monitor.recordNotesToolResult) logger.warn('[SubagentBudgetHooks] Notes result recorder missing; completion will rely on the watchdog');
  const paused = (agentId: string | undefined, sessionId?: string): boolean => monitor.hasNotesGate(agentId, sessionId) && monitor.notesGatePhase?.(agentId, sessionId) === 'paused';
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
        logger.warn('[SubagentBudgetHooks] Hook missing session id', {
          hasSessionId: false, eventName: event, agentId: data.agent_id, toolName: data.tool_name,
        });
        if (event === 'PreToolUse' && monitor.hasNotesGate(data.agent_id)) {
          if (!data.tool_name) return paused(data.agent_id) ? preToolDeny(PAUSED_GATE_FAILURE_REASON) : { continue: true };
          try {
            const reason = await monitor.checkNotesTool(undefined, data.agent_id, data.tool_name, data.tool_input);
            return reason ? preToolDeny(reason) : { continue: true };
          } catch (error: unknown) {
            logger.error('[SubagentBudgetHooks] Hook failed', {
              error: error instanceof Error ? error : new Error(String(error)), eventName: event,
              agentId: data.agent_id, toolUseId: data.tool_use_id,
            });
            return paused(data.agent_id) ? preToolDeny(PAUSED_GATE_FAILURE_REASON) : { continue: true };
          }
        }
        return { continue: true };
      }
      try {
        if (event === 'PreToolUse' && data.tool_name) {
          const reason = await monitor.checkNotesTool(sessionId, data.agent_id, data.tool_name, data.tool_input);
          return reason ? preToolDeny(reason) : { continue: true };
        }
        if (event === 'PostToolUse' && data.agent_id && data.tool_name) {
          const failed = z.object({ is_error: z.literal(true) }).safeParse(data.tool_response).success;
          if (!failed) await monitor.recordNotesToolResult?.(sessionId, data.agent_id, data.tool_name, data.tool_input);
        }
        if (event === 'SubagentStop' && data.agent_id) {
          await monitor.finishWarnedAgent(sessionId, data.agent_id);
        }
        if (event === 'PostToolUse' && !data.agent_id && data.tool_use_id && (data.tool_name === 'Agent' || data.tool_name === 'Task')) {
          const handoff = monitor.takeNormalHandoff(sessionId, data.tool_use_id);
          if (handoff) return { hookSpecificOutput: {
            hookEventName: 'PostToolUse' as const, additionalContext: handoff,
          } };
        }
      } catch (error: unknown) {
        logger.error('[SubagentBudgetHooks] Hook failed', {
          error: error instanceof Error ? error : new Error(String(error)), eventName: event,
          agentId: data.agent_id, toolUseId: data.tool_use_id,
        });
        if (event === 'PreToolUse' && paused(data.agent_id, sessionId)) return preToolDeny(PAUSED_GATE_FAILURE_REASON);
      }
      return { continue: true };
    }] }];
  }
  return result;
}
