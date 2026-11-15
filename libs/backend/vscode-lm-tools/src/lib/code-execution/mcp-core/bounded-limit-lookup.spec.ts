import 'reflect-metadata';
import type { Logger } from '@ptah-extension/vscode-core';
import {
  applicableLimits,
  classifyLaneState,
  FRESHNESS_MS,
  NEAR_LIMIT_PERCENT,
  type AgentId,
  type CliDetectionResult,
  type PlanLimitWindow,
  type SpawnAgentRequest,
  type SpawnAgentResult,
} from '@ptah-extension/shared';
import type {
  AgentNamespace,
  MCPRequest,
  MCPResponse,
  PtahAPI,
} from '../types';
import { AgentToolDispatcher } from '../mcp-stdio/agent-tool.dispatcher';
import type { AgentLimit } from './agent-limit.formatter';
import { SPAWN_GATE_WAIT_MS, spawnGateVerdict } from './agent-spawn-limit-gate';
import {
  boundedLimitLookup,
  LIMIT_LOOKUP_PENDING,
  resolvePostSpawnLimits,
  trackLimitLookup,
} from './bounded-limit-lookup';
import {
  handleMCPRequest,
  type ProtocolHandlerDependencies,
} from './protocol-dispatcher';

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
const MIN = 60_000;

const CODEX_ROW: CliDetectionResult = {
  cli: 'codex',
  installed: true,
  messagingMode: 'steer',
};
const COPILOT_ROW: CliDetectionResult = {
  cli: 'copilot',
  installed: true,
  messagingMode: 'queue',
};

function exhaustedCodexLimit(now: number): AgentLimit {
  const window: PlanLimitWindow = {
    key: 'five_hour',
    kind: 'five_hour',
    label: '5-hour session',
    used: { kind: 'percent', percent: 100 },
    usedSource: 'provider-api',
    resetsAt: now + 60 * MIN,
    resetSource: 'provider-api',
    lastResetAt: now - 60 * MIN,
    exhaustion: { observedAt: now - MIN, source: 'error-derived' },
    observedAt: now - MIN,
  };
  const owner = {
    key: 'provider#account:fp',
    providerId: 'provider',
    identityKind: 'account' as const,
    label: 'Account',
  };
  const snapshot = {
    owner,
    status: 'available' as const,
    windowSetEstablished: true,
    windows: [window],
    ownerEvidence: [],
  };
  return {
    row: CODEX_ROW,
    lookup: 'ok',
    owner,
    snapshot,
    state: classifyLaneState(applicableLimits(snapshot, null), {
      now,
      nearLimitPercent: NEAR_LIMIT_PERCENT,
      freshnessMs: FRESHNESS_MS,
    }),
  };
}

function roomCopilotLimit(now: number): AgentLimit {
  const window: PlanLimitWindow = {
    key: 'five_hour',
    kind: 'five_hour',
    label: '5-hour session',
    used: { kind: 'percent', percent: 20 },
    usedSource: 'provider-api',
    resetsAt: now + 60 * MIN,
    resetSource: 'provider-api',
    lastResetAt: now - 60 * MIN,
    observedAt: now - MIN,
  };
  const owner = {
    key: 'provider#account:cp',
    providerId: 'provider',
    identityKind: 'account' as const,
    label: 'Account',
  };
  const snapshot = {
    owner,
    status: 'available' as const,
    windowSetEstablished: true,
    windows: [window],
    ownerEvidence: [],
  };
  return {
    row: COPILOT_ROW,
    lookup: 'ok',
    owner,
    snapshot,
    state: classifyLaneState(applicableLimits(snapshot, null), {
      now,
      nearLimitPercent: NEAR_LIMIT_PERCENT,
      freshnessMs: FRESHNESS_MS,
    }),
  };
}

const SPAWNED: SpawnAgentResult = {
  agentId: 'a-1' as AgentId,
  cli: 'codex',
  status: 'running',
  startedAt: '2026-10-03T12:00:00.000Z',
};

function quietLogger(): Logger {
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return logger as Pick<Logger, keyof typeof logger> as Logger;
}

function responseContent(response: MCPResponse | null): {
  text: string;
  isError: boolean;
} {
  const result = response?.result as
    | { content: Array<{ text: string }>; isError?: boolean }
    | undefined;
  return {
    text: result?.content[0]?.text ?? '',
    isError: result?.isError === true,
  };
}

describe('boundedLimitLookup (fake timers)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the result and clears the timer when the lookup resolves before the wait', async () => {
    const lookup = new Promise<string>((resolve) => {
      setTimeout(() => resolve('ready'), 500);
    });

    const outcomePromise = boundedLimitLookup(lookup, 4_000);
    await jest.advanceTimersByTimeAsync(500);

    await expect(outcomePromise).resolves.toBe('ready');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('returns LIMIT_LOOKUP_PENDING at the wait, clears its timer, and lets the original promise resolve later', async () => {
    let backgroundSettled = false;
    const lookup = new Promise<string>((resolve) => {
      setTimeout(() => {
        backgroundSettled = true;
        resolve('cached-later');
      }, 12_000);
    });

    const outcomePromise = boundedLimitLookup(lookup, 4_000);
    await jest.advanceTimersByTimeAsync(4_000);

    await expect(outcomePromise).resolves.toBe(LIMIT_LOOKUP_PENDING);
    expect(backgroundSettled).toBe(false);
    // Only the caller's 12 s lookup timer remains; the 4 s gate timer is cleared.
    expect(jest.getTimerCount()).toBe(1);

    await jest.advanceTimersByTimeAsync(8_000);
    expect(backgroundSettled).toBe(true);
    await expect(lookup).resolves.toBe('cached-later');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('treats a rejected lookup as undefined/unknown (never blocked) and clears the timer', async () => {
    const lookup = new Promise<readonly AgentLimit[]>((_resolve, reject) => {
      setTimeout(() => reject(new Error('reader down')), 200);
    });

    const outcomePromise = boundedLimitLookup(lookup, 4_000);
    await jest.advanceTimersByTimeAsync(200);

    const outcome = await outcomePromise;
    expect(outcome).toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);

    const verdict = spawnGateVerdict(outcome, { cli: 'codex' }, NOW);
    expect(verdict.kind).not.toBe('blocked');
    expect(verdict).toEqual({
      kind: 'unknown',
      reason: 'limit lookup failed',
    });
  });

  it('swallows a late rejection after the bounded wait without unhandled rejection', async () => {
    const lookup = new Promise<string>((_resolve, reject) => {
      setTimeout(() => reject(new Error('late failure')), 9_000);
    });

    const outcomePromise = boundedLimitLookup(lookup, 4_000);
    await jest.advanceTimersByTimeAsync(4_000);
    await expect(outcomePromise).resolves.toBe(LIMIT_LOOKUP_PENDING);

    await jest.advanceTimersByTimeAsync(5_000);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('resolvePostSpawnLimits picks up a pre-lookup that settled during spawn without waiting again', async () => {
    let settleLookup: ((value: string) => void) | undefined;
    const preLookup = new Promise<string>((resolve) => {
      settleLookup = resolve;
    });
    const settlement = trackLimitLookup(preLookup);

    await expect(
      resolvePostSpawnLimits(
        preLookup,
        LIMIT_LOOKUP_PENDING,
        settlement,
        () => preLookup,
        4_000,
      ),
    ).resolves.toBe(LIMIT_LOOKUP_PENDING);

    settleLookup?.('warm');
    await preLookup;

    await expect(
      resolvePostSpawnLimits(
        preLookup,
        LIMIT_LOOKUP_PENDING,
        settlement,
        () => preLookup,
        4_000,
      ),
    ).resolves.toBe('warm');
  });
});

describe.each([
  [
    'protocol',
    async (
      ptahAPI: PtahAPI,
      args: Record<string, unknown>,
    ): Promise<{ text: string; isError: boolean }> => {
      const deps: ProtocolHandlerDependencies = {
        ptahAPI,
        permissionPromptService:
          {} as ProtocolHandlerDependencies['permissionPromptService'],
        logger: quietLogger(),
      };
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'spawn-bounded',
        method: 'tools/call',
        _callerSessionId: 'caller-1',
        params: { name: 'ptah_agent_spawn', arguments: args },
      };
      return responseContent(await handleMCPRequest(request, deps));
    },
  ],
  [
    'stdio',
    async (
      ptahAPI: PtahAPI,
      args: Record<string, unknown>,
    ): Promise<{ text: string; isError: boolean }> => {
      const dispatcher = new AgentToolDispatcher(
        ptahAPI,
        quietLogger(),
        'caller-1',
      );
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'spawn-bounded',
        method: 'tools/call',
      };
      return responseContent(
        await dispatcher.dispatch('agent_spawn', request, args),
      );
    },
  ],
] as const)('bounded spawn limit lookup over %s', (_surface, callSpawn) => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('continues at SPAWN_GATE_WAIT_MS when a named-lane lookup is slow, lets background fill cache, and blocks once cached', async () => {
    let cachedLimits: readonly AgentLimit[] | undefined;
    const spawn = jest.fn<Promise<SpawnAgentResult>, [SpawnAgentRequest]>(
      async () => SPAWNED,
    );
    const list = jest.fn<Promise<CliDetectionResult[]>, []>(async () => [
      CODEX_ROW,
      COPILOT_ROW,
    ]);
    const limits = jest.fn<
      Promise<readonly AgentLimit[] | undefined>,
      [readonly CliDetectionResult[]]
    >(() => {
      if (cachedLimits) return Promise.resolve(cachedLimits);
      return new Promise((resolve) => {
        setTimeout(() => {
          cachedLimits = [exhaustedCodexLimit(NOW), roomCopilotLimit(NOW)];
          resolve(cachedLimits);
        }, 12_000);
      });
    });
    const agent: Pick<AgentNamespace, 'spawn' | 'list' | 'limits'> = {
      spawn,
      list,
      limits,
    };
    const ptahAPI = { agent: agent as AgentNamespace } as PtahAPI;

    const firstCall = callSpawn(ptahAPI, { task: 'Implement fix', cli: 'codex' });
    await jest.advanceTimersByTimeAsync(SPAWN_GATE_WAIT_MS);
    const firstReply = await firstCall;

    expect(firstReply.isError).toBe(false);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(firstReply.text).toContain(
      '**Limit state:** unknown (limit lookup pending)',
    );
    expect(firstReply.text).toContain(
      '**Alternatives by limit state:** pending (limit lookup in progress).',
    );
    expect(cachedLimits).toBeUndefined();

    // Background lookup was not cancelled: it finishes at 12 s and fills cache.
    await jest.advanceTimersByTimeAsync(12_000 - SPAWN_GATE_WAIT_MS);
    expect(cachedLimits).toBeDefined();

    // Subsequent spawn sees the cached at-limit state immediately and blocks.
    const secondReply = await callSpawn(ptahAPI, {
      task: 'Implement fix',
      cli: 'codex',
    });
    expect(secondReply.isError).toBe(true);
    expect(secondReply.text).toContain('agent_spawn refused:');
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('bounds the post-spawn Alternatives lookup on an auto-detected spawn', async () => {
    let backgroundFinished = false;
    const spawn = jest.fn<Promise<SpawnAgentResult>, [SpawnAgentRequest]>(
      async () => SPAWNED,
    );
    const list = jest.fn<Promise<CliDetectionResult[]>, []>(async () => [
      CODEX_ROW,
      COPILOT_ROW,
    ]);
    const limits = jest.fn<
      Promise<readonly AgentLimit[] | undefined>,
      [readonly CliDetectionResult[]]
    >(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            backgroundFinished = true;
            resolve([roomCopilotLimit(NOW)]);
          }, 12_000);
        }),
    );
    const agent: Pick<AgentNamespace, 'spawn' | 'list' | 'limits'> = {
      spawn,
      list,
      limits,
    };
    const ptahAPI = { agent: agent as AgentNamespace } as PtahAPI;

    const callPromise = callSpawn(ptahAPI, { task: 'Auto spawn' });
    await jest.advanceTimersByTimeAsync(SPAWN_GATE_WAIT_MS);
    const reply = await callPromise;

    expect(reply.isError).toBe(false);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(reply.text).toContain(
      '**Alternatives by limit state:** pending (limit lookup in progress).',
    );
    expect(backgroundFinished).toBe(false);

    await jest.advanceTimersByTimeAsync(12_000 - SPAWN_GATE_WAIT_MS);
    expect(backgroundFinished).toBe(true);
  });
});
