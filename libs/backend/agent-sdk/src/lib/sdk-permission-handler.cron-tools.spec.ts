/**
 * SdkPermissionHandler — cron write tools (TASK_2026_2272_7f01, issue #1400).
 *
 * The five Ptah MCP tools that change the scheduler always ask the user, in
 * every permission level, and never get a stored "Always Allow" rule. A
 * session with nobody to answer (unattended policy, CLI lane) denies them.
 */
import 'reflect-metadata';
import * as path from 'path';
import { container } from 'tsyringe';
import type { Logger } from '@ptah-extension/vscode-core';
import {
  createMockLogger,
  type MockLogger,
} from '@ptah-extension/shared/testing';
import { MESSAGE_TYPES, type PermissionLevel } from '@ptah-extension/shared';

import { SdkPermissionHandler } from './sdk-permission-handler';
import {
  CRON_MUTATING_TOOL_NAMES,
  CRON_UNATTENDED_DENY_MESSAGE,
} from './permission/cron-tool-policy';
import { UnattendedSessionPolicyRegistry } from './permission/unattended-session-policy.registry';
import type {
  CanUseTool,
  PermissionResult,
} from './types/sdk-types/claude-sdk.types';

const TAB = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CREATE_TOOL = 'mcp__ptah__ptah_cron_create';
const LIST_TOOL = 'mcp__ptah__ptah_cron_list';

const CREATE_INPUT = {
  name: 'Nightly triage',
  cronExpression: '0 2 * * *',
  timezone: 'Africa/Cairo',
  workspaceRoot: '/home/me/project',
  prompt: 'Triage the new issues and write a summary.',
};

interface SentMessage {
  type: string;
  payload: Record<string, unknown>;
}

type SessionIdParam = Parameters<SdkPermissionHandler['createCallback']>[0];
type TabIdParam = Parameters<SdkPermissionHandler['createCallback']>[2];
type CallbackOptions = Parameters<CanUseTool>[2];

function makeHarness() {
  const logger: MockLogger = createMockLogger();
  const sent: SentMessage[] = [];
  const webviewManager = {
    sendMessage: jest.fn(
      async (
        _viewType: string,
        type: string,
        payload: Record<string, unknown>,
      ) => {
        sent.push({ type, payload });
        return true;
      },
    ),
  };
  const subagentRegistry = {
    getToolCallIdByAgentId: jest.fn().mockReturnValue(null),
    get: jest.fn().mockReturnValue(undefined),
  };
  const registry = new UnattendedSessionPolicyRegistry();
  const handler = new SdkPermissionHandler(
    logger as unknown as Logger,
    subagentRegistry as unknown as ConstructorParameters<
      typeof SdkPermissionHandler
    >[1],
    webviewManager as unknown as ConstructorParameters<
      typeof SdkPermissionHandler
    >[2],
    registry,
  );

  const callbackFor = (
    level: PermissionLevel,
    cliAgentResolver?: () => string | undefined,
  ): CanUseTool =>
    handler.createCallback(
      TAB as SessionIdParam,
      cliAgentResolver,
      TAB as TabIdParam,
      () => level,
      TAB,
    );

  const permissionRequests = () =>
    sent.filter((m) => m.type === MESSAGE_TYPES.PERMISSION_REQUEST);

  return { handler, registry, callbackFor, permissionRequests };
}

function invoke(
  callback: CanUseTool,
  toolName: string,
  input: Record<string, unknown>,
  toolUseID = `tool-${toolName}`,
): Promise<PermissionResult | null> {
  return callback(toolName, input, {
    signal: new AbortController().signal,
    toolUseID,
    requestId: toolUseID,
  } as unknown as CallbackOptions);
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe('SdkPermissionHandler — cron write tools', () => {
  afterEach(() => {
    container.clearInstances();
  });

  describe.each(['ask', 'auto-edit', 'yolo'] as const)(
    'permission level %s',
    (level) => {
      it.each([...CRON_MUTATING_TOOL_NAMES])(
        'asks the user before %s runs',
        async (toolName) => {
          const h = makeHarness();
          const pending = invoke(h.callbackFor(level), toolName, {
            id: 'job-1',
            enabled: true,
          });
          await flushMicrotasks();

          const requests = h.permissionRequests();
          expect(requests).toHaveLength(1);
          const id = requests[0].payload['id'] as string;
          h.handler.handleResponse(id, { id, decision: 'allow' });

          await expect(pending).resolves.toMatchObject({ behavior: 'allow' });
        },
      );
    },
  );

  it('shows the job prompt, schedule and workspace in the request', async () => {
    const h = makeHarness();
    const pending = invoke(h.callbackFor('yolo'), CREATE_TOOL, CREATE_INPUT);
    await flushMicrotasks();

    const request = h.permissionRequests()[0];
    const description = request.payload['description'] as string;
    expect(description).toContain('Triage the new issues');
    expect(description).toContain('0 2 * * * (Africa/Cairo)');
    expect(description).toContain('/home/me/project');

    const id = request.payload['id'] as string;
    h.handler.handleResponse(id, { id, decision: 'deny', reason: 'no' });
    await expect(pending).resolves.toMatchObject({ behavior: 'deny' });
  });

  it('asks again after "Always Allow": no rule is stored', async () => {
    const h = makeHarness();
    const callback = h.callbackFor('ask');

    const first = invoke(callback, CREATE_TOOL, CREATE_INPUT, 'call-1');
    await flushMicrotasks();
    const firstId = h.permissionRequests()[0].payload['id'] as string;
    h.handler.handleResponse(firstId, {
      id: firstId,
      decision: 'always_allow',
    });
    await expect(first).resolves.toMatchObject({ behavior: 'allow' });
    expect(h.handler.getPermissionRules()).toHaveLength(0);

    const second = invoke(callback, CREATE_TOOL, CREATE_INPUT, 'call-2');
    await flushMicrotasks();
    expect(h.permissionRequests()).toHaveLength(2);
    const secondId = h.permissionRequests()[1].payload['id'] as string;
    h.handler.handleResponse(secondId, { id: secondId, decision: 'deny' });
    await expect(second).resolves.toMatchObject({ behavior: 'deny' });
  });

  it('does not resolve a pending sibling request on "Always Allow"', async () => {
    const h = makeHarness();
    const callback = h.callbackFor('ask');

    const first = invoke(callback, CREATE_TOOL, CREATE_INPUT, 'call-1');
    const second = invoke(
      callback,
      CREATE_TOOL,
      { ...CREATE_INPUT, prompt: 'A different prompt.' },
      'call-2',
    );
    await flushMicrotasks();
    const [firstRequest, secondRequest] = h.permissionRequests();
    const firstId = firstRequest.payload['id'] as string;
    h.handler.handleResponse(firstId, {
      id: firstId,
      decision: 'always_allow',
    });
    await expect(first).resolves.toMatchObject({ behavior: 'allow' });

    let settled = false;
    void second.then(() => {
      settled = true;
    });
    await flushMicrotasks();
    expect(settled).toBe(false);

    const secondId = secondRequest.payload['id'] as string;
    h.handler.handleResponse(secondId, { id: secondId, decision: 'deny' });
    await expect(second).resolves.toMatchObject({ behavior: 'deny' });
  });

  describe.each(['ask', 'yolo'] as const)(
    'unattended session at level %s',
    (level) => {
      it.each([...CRON_MUTATING_TOOL_NAMES])(
        'denies %s without a prompt',
        async (toolName) => {
          const h = makeHarness();
          h.registry.register(TAB, {
            bashAllowlist: [],
            writableRoot: path.resolve('/root/.claude-worktrees/child'),
            denyWindowMs: 30_000,
            ownerLabel: 'the parent tab',
          });

          const result = await invoke(h.callbackFor(level), toolName, {
            id: 'job-1',
          });

          expect(result).toMatchObject({
            behavior: 'deny',
            message: CRON_UNATTENDED_DENY_MESSAGE,
          });
          expect(h.permissionRequests()).toHaveLength(0);
        },
      );
    },
  );

  it('denies a cron write tool in a CLI lane without a prompt', async () => {
    const h = makeHarness();
    const result = await invoke(
      h.callbackFor('yolo', () => 'lane-1'),
      CREATE_TOOL,
      CREATE_INPUT,
    );

    expect(result).toMatchObject({
      behavior: 'deny',
      message: CRON_UNATTENDED_DENY_MESSAGE,
    });
    expect(h.permissionRequests()).toHaveLength(0);
  });

  it('keeps the normal handling for a cron read tool', async () => {
    const h = makeHarness();

    const yolo = await invoke(h.callbackFor('yolo'), LIST_TOOL, {});
    expect(yolo).toMatchObject({ behavior: 'allow' });
    expect(h.permissionRequests()).toHaveLength(0);

    h.registry.register(TAB, {
      bashAllowlist: [],
      writableRoot: path.resolve('/root/.claude-worktrees/child'),
      denyWindowMs: 30_000,
      ownerLabel: 'the parent tab',
    });
    const unattended = await invoke(h.callbackFor('ask'), LIST_TOOL, {});
    expect(unattended).toMatchObject({ behavior: 'allow' });
    expect(h.permissionRequests()).toHaveLength(0);
  });
});
