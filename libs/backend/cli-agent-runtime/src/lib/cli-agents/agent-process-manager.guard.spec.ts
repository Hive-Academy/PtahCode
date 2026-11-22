/**
 * AgentProcessManager — the lane repeat-call guard hook and the blocked-model
 * refusal (TASK_2026_597, component 16 and R9.5).
 *
 * The contract under test: a lane's `tool-call` segments feed one guard; there
 * is no call budget and no steer; a repeat loop stops the lane through `stop`
 * with `stopReason` on the record, and the completion signal context carries
 * the call count, the repeat count and any dropped queued messages; a
 * caller's new turn resets the counts; the guard is dropped when the lane
 * ends; and a blocked model is refused before the adapter is asked to start
 * anything.
 */
import 'reflect-metadata';
import type { IWorkspaceProvider } from '@ptah-extension/platform-core';
import type {
  AgentActionNotice,
  AgentProcessInfo,
  CliOutputSegment,
  SpawnAgentRequest,
} from '@ptah-extension/shared';
import {
  AgentProcessManager,
  LaneModelBlockedError,
} from './agent-process-manager.service';
import { AgentMessageRouter } from './agent-message-router.service';
import { AgentSpawnEnvironment } from './agent-spawn-environment.service';
import { AgentOutputBuffer } from './agent-output-buffer.service';
import type { SdkHandle } from './cli-adapters/cli-adapter.interface';

const ROOT = 'D:\\projects\\workspace-a';

/** Repeat-stop at 3 identical calls. */
const GUARD_SETTINGS: Record<string, number> = {
  'agentOrchestration.laneRepeatCallStopAt': 3,
};

interface Harness {
  readonly manager: AgentProcessManager;
  readonly logger: Record<'info' | 'warn' | 'error' | 'debug', jest.Mock>;
  /** The completion notifier's `signal`: `(info, context)`. */
  readonly signal: jest.Mock;
  /** The notifier's non-terminal parent notice: `(info, notice, text)`. */
  readonly notifyActionNotice: jest.Mock;
}

function makeHarness(): Harness {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const workspaceProvider = {
    getWorkspaceRoot: jest.fn().mockReturnValue(ROOT),
    getWorkspaceFolders: jest.fn().mockReturnValue([ROOT]),
    getConfiguration: jest.fn(
      (_section: string, key: string, dflt?: unknown) =>
        GUARD_SETTINGS[key] ?? dflt,
    ),
    setConfiguration: jest.fn(),
    onDidChangeConfiguration: jest.fn(),
    onDidChangeWorkspaceFolders: jest.fn(),
  } as unknown as IWorkspaceProvider;

  type Args = ConstructorParameters<typeof AgentProcessManager>;
  type EnvironmentArgs = ConstructorParameters<typeof AgentSpawnEnvironment>;
  const cliDetection = { getAdapter: jest.fn() } as unknown as Args[1];
  const sentryService = { captureException: jest.fn() };
  const signal = jest.fn();
  const notifyActionNotice = jest.fn().mockResolvedValue('queued');
  const environment = new AgentSpawnEnvironment(
    logger as unknown as Args[0],
    cliDetection,
    workspaceProvider,
    { effort: { get: jest.fn(() => '') } } as unknown as EnvironmentArgs[3],
    sentryService as unknown as EnvironmentArgs[4],
    null,
    null,
    null,
  );
  jest.spyOn(environment, 'validateWorkingDirectory').mockResolvedValue();
  const manager = new AgentProcessManager(
    logger as unknown as Args[0],
    cliDetection,
    {
      getRunningBySession: jest.fn().mockReturnValue([]),
    } as unknown as Args[2],
    sentryService as unknown as Args[3],
    new AgentMessageRouter(logger as unknown as Args[0], cliDetection),
    environment,
    new AgentOutputBuffer(logger as unknown as Args[0]),
    { signal, notifyActionNotice } as unknown as Args[7],
    { evaluate: jest.fn() } as unknown as Args[8],
    // No quota owner and no ledger: plan limits are pinned by the manager spec.
    { ownerForLane: jest.fn(() => undefined) } as unknown as Args[9],
    {
      recordWindowEvidence: jest.fn(),
      recordOwnerEvidence: jest.fn(),
      recordSuccess: jest.fn(),
    } as unknown as Args[10],
  );
  return { manager, logger, signal, notifyActionNotice };
}

interface FakeLane {
  readonly handle: SdkHandle;
  emit(segment: CliOutputSegment): void;
  finish(code: number): void;
}

interface LaneOptions {
  /** Give the handle continuation, so a caller can start another turn. */
  readonly continuation?: boolean;
}

/** A segment-streaming handle whose `done` settles on abort or `finish`. */
function makeLane(options: LaneOptions = {}): FakeLane {
  let segmentListener: ((segment: CliOutputSegment) => void) | undefined;
  let settle: (code: number) => void = () => undefined;
  const done = new Promise<number>((resolve) => {
    settle = resolve;
  });
  const abort = new AbortController();
  abort.signal.addEventListener('abort', () => settle(130));
  const handle = {
    abort,
    done,
    getSessionId: () => 'thread-guard-test',
    onOutput: jest.fn(),
    onSegment: (listener: (segment: CliOutputSegment) => void) => {
      segmentListener = listener;
    },
    ...(options.continuation
      ? {
          supportsContinuation: () => true,
          continue: jest.fn(async () => ({
            done: new Promise<number>(() => undefined),
          })),
        }
      : {}),
  } as unknown as SdkHandle;
  return {
    handle,
    emit: (segment) => segmentListener?.(segment),
    finish: (code) => settle(code),
  };
}

function toolCall(toolName: string, path: string): CliOutputSegment {
  return {
    type: 'tool-call',
    content: '',
    toolName,
    toolInput: { path },
  } as CliOutputSegment;
}

async function startLane(
  manager: AgentProcessManager,
  options: LaneOptions = {},
): Promise<{
  readonly lane: FakeLane;
  readonly agentId: string;
}> {
  const lane = makeLane(options);
  const result = await manager.spawnFromSdkHandle(lane.handle, {
    task: 'build the thing',
    cli: 'codex',
    workingDirectory: ROOT,
    expectsMcp: false,
  });
  return { lane, agentId: result.agentId };
}

function guardCount(manager: AgentProcessManager): number {
  return (manager as unknown as { laneGuards: Map<string, unknown> }).laneGuards
    .size;
}

/** Let the fire-and-forget stop promise run to completion. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

function statusOf(
  manager: AgentProcessManager,
  agentId: string,
): AgentProcessInfo {
  return manager.getStatus(agentId) as AgentProcessInfo;
}

describe('AgentProcessManager lane repeat-call guard', () => {
  it('never steers or stops a lane on its call count alone', async () => {
    const { manager } = makeHarness();
    const { lane, agentId } = await startLane(manager);
    const stop = jest.spyOn(manager, 'stop');
    const send = jest.spyOn(manager, 'sendToAgent');

    for (let i = 0; i < 100; i++) lane.emit(toolCall('read', `file-${i}`));
    await settle();

    expect(stop).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    const info = statusOf(manager, agentId);
    expect(info.status).toBe('running');
    expect(info.stopReason).toBeUndefined();
  });

  it('asks at N identical calls and pauses at 2N without stopping the lane', async () => {
    const { manager, signal, notifyActionNotice } = makeHarness();
    const { lane, agentId } = await startLane(manager);
    const stop = jest.spyOn(manager, 'stop');
    const exited: AgentProcessInfo[] = [];
    manager.events.on('agent:exited', (info: AgentProcessInfo) =>
      exited.push(info),
    );
    const notices: AgentActionNotice[] = [];
    manager.events.on(
      'agent:action-notice',
      (event: { notice: AgentActionNotice }) => notices.push(event.notice),
    );

    lane.emit(toolCall('read', 'other'));
    for (let i = 0; i < 3; i++) lane.emit(toolCall('read', 'same'));
    await settle();
    expect(notices).toEqual([
      expect.objectContaining({
        actor: 'ptah-budget',
        action: 'asked-handoff',
        reason: 'repeat-call',
        measured: 3,
        limit: 3,
        unit: 'calls',
      }),
    ]);
    expect(statusOf(manager, agentId).actionNotice?.action).toBe(
      'asked-handoff',
    );

    for (let i = 0; i < 3; i++) lane.emit(toolCall('read', 'same'));
    await settle();
    expect(notices.map((n) => n.action)).toEqual(['asked-handoff', 'paused']);
    expect(notices[1]).toEqual(
      expect.objectContaining({ reason: 'repeat-call', limit: 6 }),
    );

    // Further repeats keep the latched pause and announce nothing new.
    for (let i = 0; i < 4; i++) lane.emit(toolCall('read', 'same'));
    await settle();
    expect(notices).toHaveLength(2);

    const info = statusOf(manager, agentId);
    expect(info.status).toBe('running');
    expect(info.stopReason).toBeUndefined();
    expect(info.actionNotice).toEqual(
      expect.objectContaining({ action: 'paused', reason: 'repeat-call' }),
    );
    expect(stop).not.toHaveBeenCalled();
    expect(lane.handle.abort.signal.aborted).toBe(false);
    expect(exited).toEqual([]);
    expect(signal).not.toHaveBeenCalled();
    // One parent notice per announced phase (ask, then pause).
    expect(notifyActionNotice).toHaveBeenCalledTimes(notices.length);
    expect(notifyActionNotice).toHaveBeenLastCalledWith(
      expect.objectContaining({ agentId }),
      expect.objectContaining({ action: 'paused', reason: 'repeat-call' }),
      expect.any(String),
    );
    expect(guardCount(manager)).toBe(1);
  });

  it('keeps queued caller messages when the repeat guard pauses a lane', async () => {
    const { manager, signal } = makeHarness();
    // Continuation without steer or interrupt: a mid-turn message is parked.
    const { lane, agentId } = await startLane(manager, { continuation: true });
    const first = await manager.sendToAgent(agentId, 'one more thing');
    expect(first.mode).toBe('queue-next-turn');
    await manager.sendToAgent(agentId, 'and another');

    for (let i = 0; i < 6; i++) lane.emit(toolCall('read', 'same'));
    await settle();

    const internals = manager as unknown as {
      agents: Map<string, { pendingMessages: unknown[] }>;
    };
    expect(internals.agents.get(agentId)?.pendingMessages).toHaveLength(2);
    expect(statusOf(manager, agentId).status).toBe('running');

    lane.finish(0);
    await settle();

    expect(signal.mock.calls[0][0].actionNotice).toEqual(
      expect.objectContaining({ action: 'paused', reason: 'repeat-call' }),
    );
    expect(lane.handle.continue).toHaveBeenCalledWith(expect.stringContaining('one more thing'));
    expect(manager.getAgentMessageStatus(agentId, first.messageId ?? '')).toEqual({ status: 'delivered' });
    expect(internals.agents.get(agentId)?.pendingMessages).toHaveLength(1);
  });

  it('passes the call count, without a stop, for a lane that ends on its own', async () => {
    const { manager, signal } = makeHarness();
    const { lane, agentId } = await startLane(manager);

    for (const path of ['a', 'b']) lane.emit(toolCall('read', path));
    lane.finish(0);
    await settle();

    expect(statusOf(manager, agentId).status).toBe('completed');
    const [info, context] = signal.mock.calls[0];
    expect(info.stopReason).toBeUndefined();
    expect(context).toEqual(expect.objectContaining({ toolCalls: 2 }));
    expect(context).not.toHaveProperty('repeatedCalls');
    expect(context).not.toHaveProperty('queuedMessagesDropped');
  });

  it('releases the guard when the lane exits, and ignores later segments', async () => {
    const { manager } = makeHarness();
    const { lane, agentId } = await startLane(manager);
    const send = jest.spyOn(manager, 'sendToAgent');
    expect(guardCount(manager)).toBe(1);

    lane.finish(0);
    await settle();

    expect(guardCount(manager)).toBe(0);
    expect(statusOf(manager, agentId).status).toBe('completed');
    for (let i = 0; i < 4; i++) lane.emit(toolCall('read', 'same'));
    await settle();
    expect(send).not.toHaveBeenCalled();
    expect(statusOf(manager, agentId).stopReason).toBeUndefined();
  });

  it('gives a new caller task a fresh call count and repeat history', async () => {
    const { manager, signal } = makeHarness();
    const { lane, agentId } = await startLane(manager, { continuation: true });

    // Turn 1: the same call twice, then the lane completes its task.
    for (let i = 0; i < 2; i++) lane.emit(toolCall('read', 'same'));
    lane.finish(0);
    await settle();
    expect(statusOf(manager, agentId).status).toBe('completed');
    expect(signal.mock.calls[0][1]).toEqual(
      expect.objectContaining({ toolCalls: 2 }),
    );

    // Turn 2 from the caller: without a reset the next identical call would
    // be the 3rd and stop the lane.
    await manager.continueConversation(agentId, 'next task');
    for (let i = 0; i < 2; i++) lane.emit(toolCall('read', 'same'));
    await settle();

    const info = statusOf(manager, agentId);
    expect(info.status).toBe('running');
    expect(info.stopReason).toBeUndefined();
  });
});

describe('AgentProcessManager blocked lane models', () => {
  it('refuses a blocked model before runSdk and starts nothing', async () => {
    const { manager } = makeHarness();
    const runSdk = jest.fn();
    const spawned = jest.fn();
    manager.events.on('agent:spawned', spawned);
    const doSpawnSdk = (
      manager as unknown as {
        doSpawnSdk(options: unknown): Promise<unknown>;
      }
    ).doSpawnSdk.bind(manager);
    const request: SpawnAgentRequest = {
      task: 'build the thing',
      cli: 'codex',
      model: 'openrouter/MIMO-v2.6-flash-free',
    };

    const attempt = doSpawnSdk({
      runSdk,
      request,
      task: request.task,
      workingDirectory: ROOT,
      cli: 'codex',
      displayName: 'Codex',
      roleChannel: 'developer-instructions',
    });

    await expect(attempt).rejects.toBeInstanceOf(LaneModelBlockedError);
    await expect(attempt).rejects.toThrow(
      'Model `openrouter/MIMO-v2.6-flash-free` is blocked for lanes because it is known to loop. Choose another model.',
    );
    expect(runSdk).not.toHaveBeenCalled();
    expect(spawned).not.toHaveBeenCalled();
    expect(manager.getStatus()).toEqual([]);
    expect(guardCount(manager)).toBe(0);
  });

  it('refuses a blocked model on the Ptah CLI path before any handle is built', async () => {
    const { manager } = makeHarness();
    const spawned = jest.fn();
    manager.events.on('agent:spawned', spawned);

    const attempt = manager.prepareSdkHandleSpawn({
      cli: 'ptah-cli',
      task: 'build the thing',
      model: 'mimo-v2.6-flash-free',
    });

    await expect(attempt).rejects.toBeInstanceOf(LaneModelBlockedError);
    expect(spawned).not.toHaveBeenCalled();
    expect(manager.getStatus()).toEqual([]);
  });

  it('leaves a Ptah CLI model left to the agent default unchecked', async () => {
    const { manager } = makeHarness();

    await expect(
      manager.prepareSdkHandleSpawn({ cli: 'ptah-cli', task: 'build' }),
    ).resolves.toEqual({ task: 'build' });
  });
});
