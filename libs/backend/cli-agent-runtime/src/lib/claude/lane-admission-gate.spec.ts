import { withNamedAccountToolGate } from '@ptah-extension/agent-sdk';
import type {
  CanUseTool,
  HookCallback,
  HookCallbackMatcher,
  HookInput,
  Options,
} from '@ptah-extension/agent-sdk';
import {
  formatBudgetCeilingDeny,
  type AgentActionNotice,
} from '@ptah-extension/shared';
import {
  LANE_GATE_PERMITTED_TOOLS,
  gateLaneCanUseTool,
  laneToolGateDenial,
  withLaneToolGate,
} from './lane-admission-gate';

const notice: AgentActionNotice = {
  actor: 'ptah-budget',
  action: 'asked-handoff',
  reason: 'context-budget',
  nextStep: 'write-notes-and-return',
  measured: 127_500,
  limit: 150_000,
  unit: 'tokens',
};
const paused = () => notice;
const open = () => undefined;
const denyText = formatBudgetCeilingDeny(notice);

const preToolUse = (toolName: string): HookInput =>
  ({
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: {},
    tool_use_id: 'tool-1',
    session_id: 's',
    transcript_path: '/t',
    cwd: '/w',
  }) as HookInput;

const hookOptions = { signal: new AbortController().signal };

async function runPreToolUse(
  matchers: HookCallbackMatcher[] | undefined,
  toolName: string,
): Promise<unknown[]> {
  const results: unknown[] = [];
  for (const matcher of matchers ?? []) {
    for (const hook of matcher.hooks) {
      results.push(await hook(preToolUse(toolName), 'tool-1', hookOptions));
    }
  }
  return results;
}

const allow: CanUseTool = async (_tool, input) => ({
  behavior: 'allow',
  updatedInput: input,
});
const toolContext = {
  signal: new AbortController().signal,
} as Parameters<CanUseTool>[2];

describe('laneToolGateDenial', () => {
  it('returns the Ptah ceiling text while paused', () => {
    expect(laneToolGateDenial(paused, 'Bash')).toBe(denyText);
    expect(denyText).toMatch(/^Ptah budget monitor paused new work tools/);
  });

  it('returns undefined while open', () => {
    expect(laneToolGateDenial(open, 'Bash')).toBeUndefined();
  });

  it.each([...LANE_GATE_PERMITTED_TOOLS])(
    'keeps %s while paused',
    (tool) => {
      expect(laneToolGateDenial(paused, tool)).toBeUndefined();
    },
  );

  it('permits exactly the read-only set and the report tool', () => {
    expect([...LANE_GATE_PERMITTED_TOOLS].sort()).toEqual(
      ['Glob', 'Grep', 'Read', 'mcp__ptah__ptah_agent_report'].sort(),
    );
  });
});

describe('gateLaneCanUseTool', () => {
  it('denies without interrupting the turn while paused', async () => {
    const inner = jest.fn(allow);
    const gated = gateLaneCanUseTool(inner, paused);
    await expect(gated('Bash', {}, toolContext)).resolves.toEqual({
      behavior: 'deny',
      message: denyText,
      interrupt: false,
    });
    expect(inner).not.toHaveBeenCalled();
  });

  it('delegates while open', async () => {
    const inner = jest.fn(allow);
    const gated = gateLaneCanUseTool(inner, open);
    await expect(gated('Bash', { a: 1 }, toolContext)).resolves.toEqual({
      behavior: 'allow',
      updatedInput: { a: 1 },
    });
    expect(inner).toHaveBeenCalledWith('Bash', { a: 1 }, toolContext);
  });

  it('delegates permitted tools while paused', async () => {
    const inner = jest.fn(allow);
    const gated = gateLaneCanUseTool(inner, paused);
    await gated('Read', {}, toolContext);
    expect(inner).toHaveBeenCalledTimes(1);
  });
});

describe('withLaneToolGate', () => {
  it('returns the same options object without a gate', () => {
    const options: Options = { canUseTool: allow };
    expect(withLaneToolGate(options, undefined)).toBe(options);
  });

  it('denies a new tool call through PreToolUse while paused', async () => {
    const gated = withLaneToolGate({}, paused);
    await expect(runPreToolUse(gated.hooks?.PreToolUse, 'Bash')).resolves.toEqual([
      {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: denyText,
        },
      },
    ]);
  });

  it('returns no decision while open', async () => {
    const gated = withLaneToolGate({}, open);
    await expect(runPreToolUse(gated.hooks?.PreToolUse, 'Bash')).resolves.toEqual([{}]);
  });

  it.each([...LANE_GATE_PERMITTED_TOOLS])(
    'allows %s through the hook while paused',
    async (tool) => {
      const gated = withLaneToolGate({}, paused);
      await expect(runPreToolUse(gated.hooks?.PreToolUse, tool)).resolves.toEqual([{}]);
    },
  );

  it('ignores hook events other than PreToolUse', async () => {
    const gated = withLaneToolGate({}, paused);
    const [hook] = gated.hooks?.PreToolUse?.[0]?.hooks ?? [];
    await expect(
      hook(
        { ...preToolUse('Bash'), hook_event_name: 'PostToolUse' } as HookInput,
        'tool-1',
        hookOptions,
      ),
    ).resolves.toEqual({});
  });

  it('keeps existing PreToolUse matchers after the gate and other hooks intact', () => {
    const existing: HookCallback = jest.fn(async () => ({}));
    const stop: HookCallback = jest.fn(async () => ({}));
    const matcher: HookCallbackMatcher = { matcher: 'Bash', hooks: [existing] };
    const gated = withLaneToolGate(
      { hooks: { PreToolUse: [matcher], Stop: [{ hooks: [stop] }] } },
      paused,
    );
    expect(gated.hooks?.PreToolUse).toHaveLength(2);
    expect(gated.hooks?.PreToolUse?.[1]).toBe(matcher);
    expect(gated.hooks?.Stop?.[0]?.hooks).toEqual([stop]);
  });

  it('adds no canUseTool when none existed', () => {
    const gated = withLaneToolGate({ permissionMode: 'bypassPermissions' }, paused);
    expect(gated.canUseTool).toBeUndefined();
    expect(gated.permissionMode).toBe('bypassPermissions');
  });

  it('wraps an existing canUseTool', async () => {
    const inner = jest.fn(allow);
    const gated = withLaneToolGate({ canUseTool: inner }, paused);
    await expect(gated.canUseTool?.('Write', {}, toolContext)).resolves.toMatchObject({
      behavior: 'deny',
      interrupt: false,
    });
    expect(inner).not.toHaveBeenCalled();
  });

  it('composes with the named-account gate: an admitted named lane is still paused', async () => {
    const inner = jest.fn(allow);
    const composed = withNamedAccountToolGate(
      withLaneToolGate({ canUseTool: inner }, paused),
      async () => true,
    );
    const decisions = await runPreToolUse(composed.hooks?.PreToolUse, 'Bash');
    expect(decisions).toHaveLength(2);
    expect(decisions[0]).toEqual({});
    expect(decisions[1]).toMatchObject({
      hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: denyText },
    });
    await expect(composed.canUseTool?.('Bash', {}, toolContext)).resolves.toMatchObject({
      behavior: 'deny',
      message: denyText,
    });
    expect(inner).not.toHaveBeenCalled();
  });

  it('composes with the named-account gate: open lane delegates once admitted', async () => {
    const inner = jest.fn(allow);
    const composed = withNamedAccountToolGate(
      withLaneToolGate({ canUseTool: inner }, open),
      async () => true,
    );
    await expect(runPreToolUse(composed.hooks?.PreToolUse, 'Bash')).resolves.toEqual([{}, {}]);
    await composed.canUseTool?.('Bash', {}, toolContext);
    expect(inner).toHaveBeenCalledTimes(1);
  });
});
