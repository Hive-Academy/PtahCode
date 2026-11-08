import type { HookInput } from '../../types/sdk-types/claude-sdk.types';
import { createSubagentBudgetHooks } from './subagent-budget-hooks';

describe('subagent budget hooks', () => {
  const monitor = {
    checkNotesTool: jest.fn().mockResolvedValue(undefined),
    hasNotesGate: jest.fn().mockReturnValue(false),
    finishWarnedAgent: jest.fn().mockResolvedValue(undefined),
    takeNormalHandoff: jest.fn(),
    takeInterruptedHandoff: jest.fn(),
  };
  const logger = { info: jest.fn(), debug: jest.fn(), error: jest.fn() };
  const hooks = createSubagentBudgetHooks(logger, monitor, 'parent-session');

  async function invoke(event: 'PostToolUse' | 'PostToolUseFailure', toolUseId: string, interrupt = false) {
    const callback = hooks[event]?.[0]?.hooks[0];
    if (!callback) throw new Error(`missing ${event} hook`);
    return callback({
      hook_event_name: event,
      session_id: 'parent-session',
      tool_name: 'Agent',
      tool_use_id: toolUseId,
      is_interrupt: interrupt,
    } as HookInput, toolUseId, { signal: new AbortController().signal });
  }

  beforeEach(() => jest.clearAllMocks());

  it('delivers a normal handoff on the parent Agent result', async () => {
    monitor.takeNormalHandoff.mockReturnValueOnce('Ptah handoff record and notes');
    expect(await invoke('PostToolUse', 'tool-1')).toEqual({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'Ptah handoff record and notes' },
    });
    expect(await invoke('PostToolUse', 'tool-1')).toEqual({ continue: true });
    expect(logger.info).toHaveBeenCalledWith('[SubagentBudgetProbe]', expect.objectContaining({ eventName: 'PostToolUse' }));
  });

  it('repairs only an interrupted budget-stopped Agent call', async () => {
    monitor.takeInterruptedHandoff.mockReturnValueOnce('continue from record');
    expect(await invoke('PostToolUseFailure', 'tool-1')).toEqual({ continue: true });
    expect(await invoke('PostToolUseFailure', 'tool-1', true)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PostToolUseFailure',
        additionalContext: expect.stringContaining("Ptah's token budget ended this subagent; not the user"),
      },
    });
  });

  it('logs a rejected notes check and denies a gated agent without rejecting the hook', async () => {
    monitor.hasNotesGate.mockReturnValueOnce(true);
    monitor.checkNotesTool.mockRejectedValueOnce(new Error('gate failed'));
    const callback = hooks.PreToolUse?.[0]?.hooks[0];
    if (!callback) throw new Error('missing PreToolUse hook');
    const result = await callback({
      hook_event_name: 'PreToolUse', session_id: 'parent-session', agent_id: 'agent-7',
      tool_name: 'Bash', tool_input: { command: 'pwd' },
    } as HookInput, 'tool-1', { signal: new AbortController().signal });
    expect(result).toEqual({ hookSpecificOutput: expect.objectContaining({ permissionDecision: 'deny' }) });
    expect(logger.error).toHaveBeenCalledWith('[SubagentBudgetHooks] Hook failed',
      expect.objectContaining({ error: expect.any(Error), eventName: 'PreToolUse' }));
    expect(monitor.checkNotesTool).toHaveBeenCalledWith('parent-session', 'agent-7', 'Bash', { command: 'pwd' });
    expect(logger.debug).toHaveBeenCalledWith('[SubagentBudgetProbe]', expect.objectContaining({ eventName: 'PreToolUse' }));
  });

  it('logs a callback failure and continues an unrelated agent', async () => {
    monitor.checkNotesTool.mockRejectedValueOnce(new Error('check failed'));
    const callback = hooks.PreToolUse?.[0]?.hooks[0];
    if (!callback) throw new Error('missing PreToolUse hook');
    expect(await callback({ hook_event_name: 'PreToolUse', session_id: 'parent-session',
      agent_id: 'other-agent', tool_name: 'Read', tool_input: { file_path: 'x' },
    } as HookInput, 'tool-2', { signal: new AbortController().signal })).toEqual({ continue: true });
    expect(logger.error).toHaveBeenCalledWith('[SubagentBudgetHooks] Hook failed', expect.objectContaining({ error: expect.any(Error) }));
  });
});
