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
  const logger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
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
        additionalContext: "Ptah's token budget ended this subagent; not the user. The SDK's STOP and wait text does not apply. The handoff follows as a separate message.",
      },
    });
  });

  it('routes live SDK agent hooks by their parent session id rather than the captured tab id', async () => {
    const parentSession = 'fa5028c2-7d72-4c51-b9bd-133b6fa31ec5';
    const agent = 'a04a16d19daddac4f';
    const liveHooks = createSubagentBudgetHooks(logger, monitor, 'd121cbf9-a3bb-45cd-8264-3f6253f3fc3a');
    const readHook = liveHooks.PreToolUse?.[0]?.hooks[0];
    const stopHook = liveHooks.SubagentStop?.[0]?.hooks[0];
    if (!readHook || !stopHook) throw new Error('budget hooks missing');
    await readHook({ hook_event_name: 'PreToolUse', session_id: parentSession, agent_id: agent,
      tool_name: 'Read', tool_use_id: 'toolu_01SJ4zSLrsZ3QPsYUi51AgYZ', tool_input: { file_path: 'note-11.txt' },
    } as HookInput, 'toolu_01SJ4zSLrsZ3QPsYUi51AgYZ', { signal: new AbortController().signal });
    await stopHook({ hook_event_name: 'SubagentStop', session_id: parentSession, agent_id: agent,
      tool_use_id: 'c813c1a5-542f-4f8d-b701-0f90e1dc54d1', cwd: 'C:/workspace', transcript_path: 'C:/workspace/agent.jsonl',
      stop_hook_active: false, agent_transcript_path: 'C:/workspace/subagent.jsonl', agent_type: 'general-purpose',
    } as HookInput, 'c813c1a5-542f-4f8d-b701-0f90e1dc54d1', { signal: new AbortController().signal });
    expect(monitor.checkNotesTool).toHaveBeenCalledWith(parentSession, agent, 'Read', { file_path: 'note-11.txt' });
    expect(monitor.finishWarnedAgent).toHaveBeenCalledWith(parentSession, agent);
  });

  it('uses the rekeyed parent session and Agent tool id for an interrupted handoff', async () => {
    const liveHooks = createSubagentBudgetHooks(logger, monitor, 'parent-before-rekey');
    monitor.takeInterruptedHandoff.mockReturnValueOnce('Ptah handoff for task-9');
    const callback = liveHooks.PostToolUseFailure?.[0]?.hooks[0];
    if (!callback) throw new Error('budget hook missing');
    await callback({ hook_event_name: 'PostToolUseFailure', session_id: 'parent-after-rekey',
      tool_name: 'Agent', tool_use_id: 'toolu_task_9', is_interrupt: true,
    } as HookInput, 'toolu_task_9', { signal: new AbortController().signal });
    expect(monitor.takeInterruptedHandoff).toHaveBeenCalledWith('parent-after-rekey', 'toolu_task_9');
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

  it('denies a warned agent without a session id when it calls a non-notes tool', async () => {
    monitor.hasNotesGate.mockReturnValueOnce(true);
    monitor.checkNotesTool.mockResolvedValueOnce('write notes first');
    const noSessionHooks = createSubagentBudgetHooks(logger, monitor);
    const callback = noSessionHooks.PreToolUse?.[0]?.hooks[0];
    if (!callback) throw new Error('missing PreToolUse hook');
    expect(await callback({ hook_event_name: 'PreToolUse', agent_id: 'agent-7',
      tool_name: 'Bash', tool_input: { command: 'pwd' },
    } as HookInput, 'tool-3', { signal: new AbortController().signal })).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse', permissionDecision: 'deny',
        permissionDecisionReason: 'write notes first',
      },
    });
    expect(monitor.hasNotesGate).toHaveBeenCalledWith('agent-7');
    expect(monitor.checkNotesTool).toHaveBeenCalledWith(undefined, 'agent-7', 'Bash', { command: 'pwd' });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('missing session id'),
      expect.objectContaining({ hasSessionId: false, eventName: 'PreToolUse', agentId: 'agent-7', toolName: 'Bash' }));
  });

  it('allows a warned agent notes write without a session id before expiry and denies it after expiry', async () => {
    monitor.hasNotesGate.mockReturnValueOnce(true).mockReturnValueOnce(true);
    monitor.checkNotesTool.mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('Ptah budget handoff expired. End your turn now.');
    const callback = createSubagentBudgetHooks(logger, monitor).PreToolUse?.[0]?.hooks[0];
    if (!callback) throw new Error('missing PreToolUse hook');
    const input = { hook_event_name: 'PreToolUse', agent_id: 'agent-7',
      tool_name: 'Write', tool_input: { file_path: 'notes.md', content: 'progress' } } as HookInput;
    expect(await callback(input, 'tool-4', { signal: new AbortController().signal })).toEqual({ continue: true });
    expect(await callback(input, 'tool-5', { signal: new AbortController().signal })).toEqual({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny',
        permissionDecisionReason: 'Ptah budget handoff expired. End your turn now.' },
    });
    expect(monitor.checkNotesTool).toHaveBeenCalledWith(undefined, 'agent-7', 'Write',
      { file_path: 'notes.md', content: 'progress' });
  });

  it('warns and allows an unwarned agent when a notes hook cannot resolve a session id', async () => {
    const noSessionHooks = createSubagentBudgetHooks(logger, monitor);
    const callback = noSessionHooks.PreToolUse?.[0]?.hooks[0];
    if (!callback) throw new Error('missing PreToolUse hook');
    expect(await callback({ hook_event_name: 'PreToolUse', agent_id: 'agent-7',
      tool_name: 'Write', tool_input: { file_path: 'notes.md' },
    } as HookInput, 'tool-3', { signal: new AbortController().signal })).toEqual({ continue: true });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('missing session id'),
      expect.objectContaining({ hasSessionId: false, eventName: 'PreToolUse', agentId: 'agent-7', toolName: 'Write' }));
  });
});
