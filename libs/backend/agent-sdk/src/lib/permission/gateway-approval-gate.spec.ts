import type {
  CanUseTool,
  HookCallback,
  HookInput,
  PermissionResult,
} from '../types/sdk-types/claude-sdk.types';
import { createCronApprovalGate } from './cron-approval-gate';
import {
  GATEWAY_APPROVAL_FAILED_MESSAGE,
  GATEWAY_APPROVAL_HOOK_MATCHER,
  GATEWAY_APPROVAL_HOOK_TIMEOUT_SECONDS,
  GATEWAY_APPROVAL_REMEMBERED_MAX,
  GATEWAY_APPROVAL_TIMEOUT_MESSAGE,
  createGatewayApprovalGate,
} from './gateway-approval-gate';

const GATEWAY = 'mcp__ptah__zernio__create_post';
const CRON_CREATE = 'mcp__ptah__ptah_cron_create';
const ALLOW: PermissionResult = { behavior: 'allow', updatedInput: {} };
const DENY: PermissionResult = { behavior: 'deny', message: 'User said no.' };

/** Host tool names as the HTTP MCP server registers them (bare). */
const HOST_TOOLS = new Set([
  'ptah_cron_create',
  'ptah_cron_list',
  'ptah_agent_report',
  'ptah_search_files',
]);

/** Same contract as `IMcpGateway.isGatewayTool`: unknown names are gateway. */
const isGatewayTool = (name: string): boolean =>
  !HOST_TOOLS.has(name.replace(/^mcp__ptah__/, ''));

function preToolUse(toolName: string, toolUseId = 'tu-1'): HookInput {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: { text: 'hello' },
    tool_use_id: toolUseId,
  } as unknown as HookInput;
}

function denied(reason: string) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}

function setup(
  result: PermissionResult | Promise<PermissionResult> | null | undefined,
  predicate: (name: string) => boolean = isGatewayTool,
) {
  const gate = jest.fn<ReturnType<CanUseTool>, Parameters<CanUseTool>>(
    async () => result as PermissionResult,
  );
  const next = jest.fn<ReturnType<CanUseTool>, Parameters<CanUseTool>>(
    async () => ALLOW,
  );
  const onError = jest.fn();
  const approval = createGatewayApprovalGate(gate, {
    isGatewayTool: predicate,
    next,
    onError,
    deadlineMs: 50,
  });
  const hook = approval.hookMatcher.hooks[0] as HookCallback;
  const signal = new AbortController().signal;
  const runHook = (toolName: string, toolUseId = 'tu-1') =>
    hook(preToolUse(toolName, toolUseId), toolUseId, { signal });
  const context = (toolUseID: string) =>
    ({ signal, toolUseID }) as Parameters<CanUseTool>[2];
  return { gate, next, onError, approval, runHook, context };
}

describe('createGatewayApprovalGate', () => {
  it('matches every ptah server tool and holds the hook for the prompt', () => {
    const { approval } = setup(ALLOW);
    const matcher = new RegExp(`^(?:${GATEWAY_APPROVAL_HOOK_MATCHER})$`);
    for (const name of [
      GATEWAY,
      'mcp__ptah__zernio_ab12__create_post',
      'mcp__ptah__x__y',
      CRON_CREATE,
    ]) {
      expect(matcher.test(name)).toBe(true);
    }
    expect(matcher.test('mcp__github__create_issue')).toBe(false);
    expect(matcher.test('Bash')).toBe(false);
    expect(approval.hookMatcher.timeout).toBe(
      GATEWAY_APPROVAL_HOOK_TIMEOUT_SECONDS,
    );
  });

  it.each([
    ['a gateway tool', GATEWAY],
    ['a suffixed alias after a collision', 'mcp__ptah__zernio_ab12__create_post'],
    ['an unknown name before any list', 'mcp__ptah__x__y'],
  ])(
    'asks in PreToolUse for %s, so an mcp__ptah__* allow rule cannot skip the prompt',
    async (_label, toolName) => {
      const { gate, runHook } = setup(ALLOW);
      await expect(runHook(toolName)).resolves.toEqual({});
      expect(gate).toHaveBeenCalledTimes(1);
      expect(gate).toHaveBeenCalledWith(
        toolName,
        { text: 'hello' },
        expect.objectContaining({ toolUseID: 'tu-1' }),
      );
    },
  );

  it('denies from the hook when the callback denies', async () => {
    const { runHook } = setup(DENY);
    await expect(runHook(GATEWAY)).resolves.toEqual(denied('User said no.'));
  });

  it('denies when the callback gives no decision', async () => {
    const { runHook } = setup(undefined);
    await expect(runHook(GATEWAY)).resolves.toEqual(
      denied(GATEWAY_APPROVAL_FAILED_MESSAGE),
    );
  });

  it('denies when the callback rejects', async () => {
    const { onError, runHook } = setup(Promise.reject(new Error('boom')));
    await expect(runHook(GATEWAY)).resolves.toEqual(
      denied(GATEWAY_APPROVAL_FAILED_MESSAGE),
    );
    expect(onError).toHaveBeenCalledWith(expect.any(Error), GATEWAY);
  });

  it('denies when the callback throws synchronously', async () => {
    const gate = jest.fn<ReturnType<CanUseTool>, Parameters<CanUseTool>>(
      () => {
        throw new Error('sync boom');
      },
    );
    const onError = jest.fn();
    const approval = createGatewayApprovalGate(gate, {
      isGatewayTool,
      onError,
      deadlineMs: 50,
    });
    const hook = approval.hookMatcher.hooks[0] as HookCallback;
    await expect(
      hook(preToolUse(GATEWAY), 'tu-1', {
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual(denied(GATEWAY_APPROVAL_FAILED_MESSAGE));
    expect(onError).toHaveBeenCalledWith(expect.any(Error), GATEWAY);
  });

  it('denies on its own deadline, before the CLI hook timeout', async () => {
    const { gate, runHook } = setup(
      new Promise<PermissionResult>(() => undefined),
    );
    const output = await runHook(GATEWAY);
    // The pending prompt is cancelled, so it does not stay open.
    expect(gate.mock.calls[0][2].signal.aborted).toBe(true);
    expect(output).toEqual(denied(GATEWAY_APPROVAL_TIMEOUT_MESSAGE));
  });

  it('treats the name as a gateway tool when the predicate throws', async () => {
    const { gate, onError, runHook } = setup(DENY, () => {
      throw new Error('registry broken');
    });
    await expect(runHook(GATEWAY)).resolves.toEqual(denied('User said no.'));
    expect(gate).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), GATEWAY);
  });

  it('gives no decision for ptah_cron_create and other host tools', async () => {
    const { gate, runHook } = setup(DENY);
    await expect(runHook(CRON_CREATE)).resolves.toEqual({});
    await expect(runHook('mcp__ptah__ptah_search_files')).resolves.toEqual({});
    expect(gate).not.toHaveBeenCalled();
  });

  it('never asks the predicate about a name outside the ptah server', async () => {
    const predicate = jest.fn(() => true);
    const { gate, next, approval, runHook, context } = setup(DENY, predicate);
    await expect(runHook('Bash')).resolves.toEqual({});
    await expect(runHook('mcp__github__create_issue')).resolves.toEqual({});
    await approval.canUseTool('Bash', {}, context('tu-1'));
    expect(predicate).not.toHaveBeenCalled();
    expect(gate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not ask a second time when canUseTool follows the hook', async () => {
    const { gate, next, approval, runHook, context } = setup(ALLOW);
    await runHook(GATEWAY, 'tu-7');
    await expect(
      approval.canUseTool(GATEWAY, {}, context('tu-7')),
    ).resolves.toEqual(ALLOW);
    expect(gate).toHaveBeenCalledTimes(1);
    // The remembered decision is used once: a new call asks again.
    await approval.canUseTool(GATEWAY, {}, context('tu-7'));
    expect(gate).toHaveBeenCalledTimes(2);
    expect(next).not.toHaveBeenCalled();
  });

  it('keeps a bounded number of decisions when canUseTool never reads them', async () => {
    const { gate, approval, runHook, context } = setup(ALLOW);
    for (let i = 0; i <= GATEWAY_APPROVAL_REMEMBERED_MAX; i++) {
      await runHook(GATEWAY, `tu-${i}`);
    }
    const asked = gate.mock.calls.length;
    await approval.canUseTool(GATEWAY, {}, context('tu-0'));
    expect(gate).toHaveBeenCalledTimes(asked + 1);
    await approval.canUseTool(
      GATEWAY,
      {},
      context(`tu-${GATEWAY_APPROVAL_REMEMBERED_MAX}`),
    );
    expect(gate).toHaveBeenCalledTimes(asked + 1);
  });

  it('delegates non-gateway names to next', async () => {
    const { gate, next, approval, context } = setup(DENY);
    await expect(
      approval.canUseTool(CRON_CREATE, { a: 1 }, context('tu-1')),
    ).resolves.toEqual(ALLOW);
    expect(next).toHaveBeenCalledWith(
      CRON_CREATE,
      { a: 1 },
      expect.objectContaining({ toolUseID: 'tu-1' }),
    );
    expect(gate).not.toHaveBeenCalled();
  });

  it('wrapping the cron gate asks once for a cron tool and once for a gateway tool', async () => {
    const held = jest.fn<ReturnType<CanUseTool>, Parameters<CanUseTool>>(
      async () => ALLOW,
    );
    const cron = createCronApprovalGate(held, { deadlineMs: 50 });
    const gateway = createGatewayApprovalGate(held, {
      isGatewayTool,
      next: cron.canUseTool,
      deadlineMs: 50,
    });
    const signal = new AbortController().signal;
    const hooks = [cron.hookMatcher, gateway.hookMatcher].map(
      (m) => m.hooks[0] as HookCallback,
    );
    const runHooks = async (toolName: string, id: string) => {
      for (const hook of hooks) {
        await expect(
          hook(preToolUse(toolName, id), id, { signal }),
        ).resolves.toEqual({});
      }
    };
    const context = (toolUseID: string) =>
      ({ signal, toolUseID }) as Parameters<CanUseTool>[2];

    await runHooks(CRON_CREATE, 'tu-cron');
    await runHooks(GATEWAY, 'tu-gw');
    expect(held).toHaveBeenCalledTimes(2);

    await gateway.canUseTool(CRON_CREATE, {}, context('tu-cron'));
    await gateway.canUseTool(GATEWAY, {}, context('tu-gw'));
    expect(held).toHaveBeenCalledTimes(2);
    expect(held.mock.calls.map((call) => call[0])).toEqual([
      CRON_CREATE,
      GATEWAY,
    ]);
  });

  it('cancels the prompt when the SDK aborts the hook', async () => {
    const pending = jest.fn<ReturnType<CanUseTool>, Parameters<CanUseTool>>(
      () => new Promise<PermissionResult>(() => undefined),
    );
    const sdk = new AbortController();
    const approval = createGatewayApprovalGate(pending, {
      isGatewayTool,
      deadlineMs: 50,
    });
    const run = (approval.hookMatcher.hooks[0] as HookCallback)(
      preToolUse(GATEWAY, 'tu-2'),
      'tu-2',
      { signal: sdk.signal },
    );
    sdk.abort();
    expect(pending.mock.calls[0][2].signal.aborted).toBe(true);
    await expect(run).resolves.toEqual(
      denied(GATEWAY_APPROVAL_TIMEOUT_MESSAGE),
    );
  });
});
