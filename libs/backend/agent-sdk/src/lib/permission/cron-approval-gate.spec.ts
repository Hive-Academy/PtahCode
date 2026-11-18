import type {
  CanUseTool,
  HookCallback,
  HookInput,
  PermissionResult,
} from '../types/sdk-types/claude-sdk.types';
import {
  CRON_APPROVAL_FAILED_MESSAGE,
  CRON_APPROVAL_HOOK_MATCHER,
  CRON_APPROVAL_HOOK_TIMEOUT_SECONDS,
  CRON_APPROVAL_TIMEOUT_MESSAGE,
  createCronApprovalGate,
} from './cron-approval-gate';
import { CRON_MUTATING_TOOL_NAMES } from './cron-tool-policy';

const CREATE = 'mcp__ptah__ptah_cron_create';
const ALLOW: PermissionResult = { behavior: 'allow', updatedInput: {} };
const DENY: PermissionResult = { behavior: 'deny', message: 'User said no.' };

function preToolUse(toolName: string, toolUseId = 'tu-1'): HookInput {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: { name: 'Nightly' },
    tool_use_id: toolUseId,
  } as unknown as HookInput;
}

function setup(result: PermissionResult | Promise<PermissionResult>) {
  const gate = jest.fn<ReturnType<CanUseTool>, Parameters<CanUseTool>>(
    async () => result,
  );
  const onError = jest.fn();
  const approval = createCronApprovalGate(gate, { onError, deadlineMs: 50 });
  const hook = approval.hookMatcher.hooks[0] as HookCallback;
  const signal = new AbortController().signal;
  const runHook = (toolName: string, toolUseId = 'tu-1') =>
    hook(preToolUse(toolName, toolUseId), toolUseId, { signal });
  const context = (toolUseID: string) =>
    ({ signal, toolUseID }) as Parameters<CanUseTool>[2];
  return { gate, onError, approval, runHook, context };
}

describe('createCronApprovalGate', () => {
  it('matches every cron write tool and holds the hook for the prompt', () => {
    const { approval } = setup(ALLOW);
    const matcher = new RegExp(`^(?:${CRON_APPROVAL_HOOK_MATCHER})$`);
    for (const name of CRON_MUTATING_TOOL_NAMES) {
      expect(matcher.test(name)).toBe(true);
    }
    expect(approval.hookMatcher.timeout).toBe(
      CRON_APPROVAL_HOOK_TIMEOUT_SECONDS,
    );
  });

  it('asks in PreToolUse, so an allow rule cannot skip the prompt', async () => {
    const { gate, runHook } = setup(ALLOW);
    await expect(runHook(CREATE)).resolves.toEqual({});
    expect(gate).toHaveBeenCalledTimes(1);
    expect(gate).toHaveBeenCalledWith(
      CREATE,
      { name: 'Nightly' },
      expect.objectContaining({ toolUseID: 'tu-1' }),
    );
  });

  it('denies from the hook when the user refuses', async () => {
    const { runHook } = setup(DENY);
    await expect(runHook(CREATE)).resolves.toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'User said no.',
      },
    });
  });

  it('does not ask a second time when canUseTool follows the hook', async () => {
    const { gate, approval, runHook, context } = setup(ALLOW);
    await runHook(CREATE, 'tu-7');
    await expect(
      approval.canUseTool(CREATE, {}, context('tu-7')),
    ).resolves.toEqual(ALLOW);
    expect(gate).toHaveBeenCalledTimes(1);
    // The remembered decision is used once: a new call asks again.
    await approval.canUseTool(CREATE, {}, context('tu-7'));
    expect(gate).toHaveBeenCalledTimes(2);
  });

  it('asks in canUseTool when no hook decision exists for that call', async () => {
    const { gate, approval, runHook, context } = setup(ALLOW);
    await runHook(CREATE, 'tu-1');
    await approval.canUseTool(CREATE, {}, context('tu-other'));
    expect(gate).toHaveBeenCalledTimes(2);
  });

  it('gives no decision for cron read tools and other tools', async () => {
    const { gate, approval, runHook, context } = setup(DENY);
    await expect(runHook('mcp__ptah__ptah_cron_list')).resolves.toEqual({});
    await expect(runHook('Bash')).resolves.toEqual({});
    expect(gate).not.toHaveBeenCalled();
    await approval.canUseTool('Bash', {}, context('tu-1'));
    expect(gate).toHaveBeenCalledTimes(1);
  });

  it('denies when the prompt throws', async () => {
    const { onError, runHook } = setup(Promise.reject(new Error('boom')));
    const output = await runHook(CREATE);
    expect(output).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: CRON_APPROVAL_FAILED_MESSAGE,
      },
    });
    expect(onError).toHaveBeenCalledWith(expect.any(Error), CREATE);
  });

  it('denies on its own deadline, before the CLI hook timeout', async () => {
    const { runHook } = setup(new Promise<PermissionResult>(() => undefined));
    const output = await runHook(CREATE);
    expect(output).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: CRON_APPROVAL_TIMEOUT_MESSAGE,
      },
    });
  });
});
