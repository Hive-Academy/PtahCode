import 'reflect-metadata';
import type { Logger } from '@ptah-extension/vscode-core';
import type {
  IMcpGateway,
  IPlatformInfo,
  McpCallerBinding,
} from '@ptah-extension/platform-core';
import type { AuthEnv } from '@ptah-extension/shared';
import { createMockLogger } from '@ptah-extension/shared/testing';
import {
  SdkQueryRunner,
  keepMcpServersOnArgv,
  type OneShotRunInput,
} from './sdk-query-runner.service';
import { oneShotGatewayDenyHook } from '../permission/one-shot-gateway-deny-hook';
import type { SdkQueryOptions } from './sdk-query-options-builder';
import type { SdkRuntimeStateService } from './sdk-runtime-state.service';
import type { SdkModuleLoader } from './sdk-module-loader';
import type { SubagentHookHandler } from './subagent-hook-handler';
import type { CompactionConfigProvider } from './compaction-config-provider';
import type { SdkModelService } from './sdk-model-service';
import type { OffThreadProcessSpawner } from './off-thread-process-spawner';
import type {
  HookCallbackMatcher,
  HookInput,
  HookJSONOutput,
} from '../types/sdk-types/claude-sdk.types';

describe('keepMcpServersOnArgv', () => {
  it('keeps MCP configs on argv when the caller did not choose', () => {
    const options: SdkQueryOptions = { mcpServers: {} };

    keepMcpServersOnArgv(options);

    expect(options.mcpServersDelivery).toBe('argv');
  });

  it('leaves a caller choice alone', () => {
    const options: SdkQueryOptions = { mcpServersDelivery: 'initialize' };

    keepMcpServersOnArgv(options);

    expect(options.mcpServersDelivery).toBe('initialize');
  });
});

// ---------------------------------------------------------------------------
// TASK_2026_979: connector opt-in on one-shot runs (C4, N1, N2b)
// ---------------------------------------------------------------------------

const HOST_TOOL = 'mcp__ptah__ptah_workspace_analyze';
const GATEWAY_TOOL = 'mcp__ptah__github__create_issue';

type GatewayStub = jest.Mocked<
  Pick<IMcpGateway, 'isGatewayTool' | 'servedFileServerNames'>
>;

function gatewayStub(served: string[] | Error = []): GatewayStub {
  return {
    isGatewayTool: jest.fn((name: string) => name !== HOST_TOOL),
    servedFileServerNames: jest.fn((_root: string) =>
      served instanceof Error
        ? Promise.reject(served)
        : Promise.resolve(served),
    ),
  };
}

interface Harness {
  run(extra?: Partial<OneShotRunInput>): Promise<SdkQueryOptions>;
  issue: jest.Mock;
  logger: ReturnType<typeof createMockLogger>;
}

function harness(gateway?: GatewayStub): Harness {
  const logger = createMockLogger();
  const queryFn = jest.fn(() => ({
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.resolve({ done: true, value: undefined }),
    }),
    close: jest.fn(),
    interrupt: jest.fn(),
  }));
  const issue = jest.fn().mockReturnValue('test-token');
  const ctor = SdkQueryRunner as unknown as new (
    ...args: unknown[]
  ) => SdkQueryRunner;
  const runner = new ctor(
    logger as unknown as Logger,
    {
      getHealth: jest
        .fn()
        .mockReturnValue({ status: 'available', lastCheck: Date.now() }),
      getCliJsPath: jest.fn().mockReturnValue(null),
      hasInitialized: jest.fn().mockReturnValue(true),
    } as unknown as SdkRuntimeStateService,
    {
      getQueryFunction: jest.fn().mockResolvedValue(queryFn),
      getCliJsPath: jest.fn().mockResolvedValue(null),
    } as unknown as SdkModuleLoader,
    {
      createHooks: jest.fn().mockReturnValue({}),
    } as unknown as SubagentHookHandler,
    {
      getConfig: jest
        .fn()
        .mockReturnValue({ enabled: true, contextTokenThreshold: null }),
    } as unknown as CompactionConfigProvider,
    {} as AuthEnv,
    { resolveModelId: jest.fn((m: string) => m) } as unknown as SdkModelService,
    {
      extensionPath: '/opt/ptah/resources/app.asar',
      globalStoragePath: '/opt/ptah-storage',
    } as unknown as IPlatformInfo,
    { spawn: jest.fn() } as unknown as OffThreadProcessSpawner,
    null,
    null,
    null,
    null,
    { issue, revokeSubject: jest.fn() },
    gateway,
  );
  return {
    issue,
    logger,
    run: async (extra = {}) => {
      await runner.runOneShot({
        mode: 'oneShot',
        cwd: '/work/project',
        model: 'claude-sonnet-4-20250514',
        prompt: 'hi',
        mcpServerRunning: true,
        ...extra,
      });
      const [params] = queryFn.mock.calls[0] as unknown as [
        { options: SdkQueryOptions },
      ];
      return params.options;
    },
  };
}

function preToolUse(toolName: string): HookInput {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: {},
    tool_use_id: 'tu-1',
    session_id: 's',
    transcript_path: '',
    cwd: '/work/project',
  } as unknown as HookInput;
}

/** Run every matching `PreToolUse` hook, as the CLI would. */
async function runPreToolUse(
  matchers: HookCallbackMatcher[] | undefined,
  toolName: string,
): Promise<HookJSONOutput[]> {
  const outputs: HookJSONOutput[] = [];
  for (const matcher of matchers ?? []) {
    if (matcher.matcher && !new RegExp(`^${matcher.matcher}$`).test(toolName)) {
      continue;
    }
    for (const hook of matcher.hooks) {
      outputs.push(
        await hook(preToolUse(toolName), 'tu-1', {
          signal: new AbortController().signal,
        }),
      );
    }
  }
  return outputs;
}

function deniedReason(outputs: HookJSONOutput[]): string | undefined {
  for (const output of outputs) {
    const specific = (
      output as {
        hookSpecificOutput?: {
          permissionDecision?: string;
          permissionDecisionReason?: string;
        };
      }
    ).hookSpecificOutput;
    if (specific?.permissionDecision === 'deny') {
      return specific.permissionDecisionReason;
    }
  }
  return undefined;
}

function bindingOf(issue: jest.Mock): McpCallerBinding {
  return issue.mock.calls[0][0] as McpCallerBinding;
}

describe('SdkQueryRunner: connector opt-in (TASK_2026_979)', () => {
  describe('binding flags', () => {
    it('mints no includeConnectors for a curator-style input', async () => {
      const h = harness(gatewayStub());
      await h.run();

      expect(bindingOf(h.issue)).toEqual({
        kind: 'internal-query',
        workspaceRoot: '/work/project',
        capability: 'privileged',
      });
    });

    it('mints none for an explicit false either', async () => {
      const h = harness(gatewayStub());
      await h.run({ includeConnectors: false });

      expect(bindingOf(h.issue)).not.toHaveProperty('includeConnectors');
    });

    it('carries includeConnectors: true only when the input opts in', async () => {
      const h = harness(gatewayStub());
      await h.run({ includeConnectors: true });

      expect(bindingOf(h.issue)).toEqual({
        kind: 'internal-query',
        workspaceRoot: '/work/project',
        capability: 'privileged',
        includeConnectors: true,
      });
    });
  });

  describe('one-shot PreToolUse gateway hook (N2b)', () => {
    it('denies a gateway tool without the opt-in', async () => {
      const h = harness(gatewayStub());
      const options = await h.run();

      const outputs = await runPreToolUse(
        options.hooks?.PreToolUse,
        GATEWAY_TOOL,
      );
      expect(deniedReason(outputs)).toBe(
        'connectors are not enabled for this run',
      );
    });

    it('leaves the host tools of Ptah alone without the opt-in', async () => {
      const h = harness(gatewayStub());
      const options = await h.run();

      const outputs = await runPreToolUse(options.hooks?.PreToolUse, HOST_TOOL);
      expect(deniedReason(outputs)).toBeUndefined();
    });

    it('allows a gateway tool with the opt-in', async () => {
      const h = harness(gatewayStub());
      const options = await h.run({ includeConnectors: true });

      const outputs = await runPreToolUse(
        options.hooks?.PreToolUse,
        GATEWAY_TOOL,
      );
      expect(deniedReason(outputs)).toBeUndefined();
    });

    it('denies when the gateway predicate throws, and reports it', async () => {
      const onError = jest.fn();
      const matcher = oneShotGatewayDenyHook(() => {
        throw new Error('registry not ready');
      }, onError);

      expect(matcher.matcher).toBe('mcp__ptah__.*');
      const outputs = await runPreToolUse([matcher], GATEWAY_TOOL);
      expect(deniedReason(outputs)).toBe(
        'connectors are not enabled for this run',
      );
      expect(onError).toHaveBeenCalledWith(expect.any(Error), GATEWAY_TOOL);
    });

    it('ignores the tools of other servers', async () => {
      const matcher = oneShotGatewayDenyHook(() => true);

      const output = await matcher.hooks[0](
        preToolUse('mcp__github__create_issue'),
        'tu-1',
        { signal: new AbortController().signal },
      );
      expect(deniedReason([output])).toBeUndefined();
    });

    it('N1: with the hook bypassed, a no-opt-in binding still opens no gateway tool', async () => {
      // The gateway caller policy is authoritative: an `internal-query` scope
      // is listed and served gateway tools only with `privileged` AND
      // `includeConnectors: true` (IMcpGateway contract). With the client
      // hook removed, the binding alone must still fail that test.
      const h = harness(gatewayStub());
      const options = await h.run();
      delete options.hooks?.PreToolUse;

      const binding = bindingOf(h.issue);
      expect(binding.kind).toBe('internal-query');
      expect(binding.includeConnectors).not.toBe(true);
    });
  });

  describe('flag-tier suppression of served file servers (C4)', () => {
    it('denies the file servers the gateway serves, with the opt-in', async () => {
      const gateway = gatewayStub(['github', 'ptah', 'linear']);
      const h = harness(gateway);
      const options = await h.run({ includeConnectors: true });

      expect(gateway.servedFileServerNames).toHaveBeenCalledWith(
        '/work/project',
      );
      expect(options.settings).toMatchObject({
        disabledMcpjsonServers: ['github', 'linear'],
      });
      // `ptah` itself is never suppressed.
      expect(Object.keys(options.mcpServers ?? {})).toEqual(['ptah']);
    });

    it('does not ask the gateway for a run without the opt-in', async () => {
      const gateway = gatewayStub(['github']);
      const h = harness(gateway);
      const options = await h.run();

      expect(gateway.servedFileServerNames).not.toHaveBeenCalled();
      expect(options.settings).not.toHaveProperty('disabledMcpjsonServers');
    });

    it('gives an empty list and a warning when the gateway throws', async () => {
      const h = harness(gatewayStub(new Error('disk gone')));
      const options = await h.run({ includeConnectors: true });

      expect(options.settings).not.toHaveProperty('disabledMcpjsonServers');
      expect(h.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('gateway serves'),
        expect.objectContaining({ error: 'disk gone' }),
      );
    });
  });
});
