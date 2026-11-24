import { AgentProcessManager, AgentSpawnEnvironment, CliDetectionService, LaneLimitLookupService } from '@ptah-extension/cli-agent-runtime';
import { AgentId, type AgentProcessInfo, type AgentStatus } from '@ptah-extension/shared';
import { ReviewLaneSpawnError, findRepositoryWorkspaceFolder } from '@ptah-extension/review-core';
import { ReviewLaneGateway } from './review-lane-gateway';
import { mkdtemp, readdir, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IWorkspaceProvider } from '@ptah-extension/platform-core';
import type { LaneModelEntry, LaneModelListing } from '@ptah-extension/lane-routing';
import { REVIEW_LANE_CATALOG_MAX } from '@ptah-extension/review-contracts';

// The real block list is product data; the spec pins one blocked id so it does not depend on it.
jest.mock('@ptah-extension/cli-agent-runtime', () => ({
  ...jest.requireActual<typeof import('@ptah-extension/cli-agent-runtime')>('@ptah-extension/cli-agent-runtime'),
  findBlockedLaneModel: (model: string | undefined) => (model === 'blocked-model' ? model : undefined),
}));

const reviewRepo = { owner: 'Hive-Academy', name: 'PtahCode' };

describe('ReviewLaneGateway', () => {
  it('filters disabled lanes, ranks eligible Ptah agents, and rejects a lane disabled after list', async () => {
    const manager = Object.create(AgentProcessManager.prototype) as AgentProcessManager;
    const spawn = jest.spyOn(manager, 'spawn').mockRejectedValue(new Error('spawn reached'));
    const detection = Object.create(CliDetectionService.prototype) as CliDetectionService;
    jest.spyOn(detection, 'getInstalledClis').mockResolvedValue([
      { cli: 'copilot', installed: true, messagingMode: 'none' },
      { cli: 'codex', installed: true, messagingMode: 'none' },
    ]);
    const limits = Object.create(LaneLimitLookupService.prototype) as LaneLimitLookupService;
    jest.spyOn(limits, 'lookup').mockImplementation(async (rows) => rows.map((row) => ({
      row, lookup: 'ok' as const, state: { state: 'confirmed-room' as const, reasons: [], windows: [] },
    })));
    const environment = Object.create(AgentSpawnEnvironment.prototype) as AgentSpawnEnvironment;
    jest.spyOn(environment, 'resolveModel').mockReturnValue({ model: undefined, source: 'cli-default' });
    jest.spyOn(environment, 'maxConcurrentAgents').mockReturnValue(5);
    let disabled = ['copilot'];
    const workspace = { getConfiguration: (_section: string, key: string) => key === 'preferredAgentOrder'
      ? ['agent-1', 'codex'] : disabled } as IWorkspaceProvider;
    const registry = { listAgents: jest.fn().mockResolvedValue([
      { id: 'agent-1', name: 'One', providerName: 'Anthropic', enabled: true, hasApiKey: true },
      { id: 'agent-2', name: 'Two', providerName: 'Anthropic', enabled: true, hasApiKey: false },
      { id: 'agent-3', name: 'Three', providerName: 'Anthropic', enabled: false, hasApiKey: true },
    ]) };
    const logger = { warn: jest.fn() };
    const gateway = new ReviewLaneGateway(manager, detection, limits, environment, () => registry, () => workspace, logger);
    expect((await gateway.list()).lanes.map((lane) => lane.id)).toEqual(['ptah-cli:agent-1', 'codex']);
    expect((await gateway.list()).lanes.map((lane) => lane.label)).toEqual(['One', 'codex']);
    await expect(gateway.spawn({ laneId: 'ptah-cli:agent-1', cwd: '/attempt', prompt: 'Review', signal: new AbortController().signal, repo: reviewRepo }))
      .rejects.toThrow('spawn reached');
    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ cli: 'ptah-cli', ptahCliId: 'agent-1' }));
    disabled = ['copilot', 'codex'];
    await expect(gateway.spawn({ laneId: 'codex', cwd: '/attempt', prompt: 'Review', signal: new AbortController().signal, repo: reviewRepo }))
      .rejects.toThrow('Review lane unavailable');
    registry.listAgents.mockRejectedValue(new Error('registry unavailable'));
    expect((await gateway.list()).lanes.map((lane) => lane.id)).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Ptah CLI agents are not available'),
      { error: 'registry unavailable' });
    disabled = ['copilot'];
    expect((await gateway.list()).lanes.map((lane) => lane.id)).toEqual(['codex']);
  });
  it('hands large prompts through an attempt file and removes it, while passing small prompts unchanged', async () => {
    const manager = Object.create(AgentProcessManager.prototype) as AgentProcessManager;
    let captured = '';
    let taskFile = '';
    jest.spyOn(manager, 'spawn').mockImplementation(async (options) => {
      taskFile = /^Read (\S+) with your file tool/.exec(options.task)?.[1] ?? '';
      captured = await readFile(taskFile, 'utf8');
      throw new Error('spawn reached');
    });
    const detection = Object.create(CliDetectionService.prototype) as CliDetectionService;
    jest.spyOn(detection, 'getInstalledClis').mockResolvedValue([{ cli: 'codex', installed: true, messagingMode: 'none' }]);
    const limits = Object.create(LaneLimitLookupService.prototype) as LaneLimitLookupService;
    jest.spyOn(limits, 'lookup').mockImplementation(async (rows) => rows.map((row) => ({
      row, lookup: 'ok' as const, state: { state: 'confirmed-room' as const, reasons: [], windows: [] },
    })));
    const environment = Object.create(AgentSpawnEnvironment.prototype) as AgentSpawnEnvironment;
    jest.spyOn(environment, 'resolveModel').mockReturnValue({ model: undefined, source: 'cli-default' });
    const gateway = new ReviewLaneGateway(manager, detection, limits, environment);
    const cwd = await mkdtemp(join(tmpdir(), 'review-gateway-'));
    // An earlier lane can plant a symlink in the attempt folder; the write must not follow it.
    const victimDir = await mkdtemp(join(tmpdir(), 'review-gateway-victim-'));
    await writeFile(join(victimDir, 'review-task.md'), 'untouched', 'utf8');
    // A directory junction needs no symlink privilege on Windows; POSIX ignores the type argument.
    await symlink(victimDir, join(cwd, 'task'), 'junction');
    const prompt = 'A'.repeat(100_001);
    await expect(gateway.spawn({ laneId: 'codex', cwd, prompt, signal: new AbortController().signal, repo: reviewRepo }))
      .rejects.toThrow('spawn reached');
    expect(captured).toBe(prompt);
    expect(taskFile.startsWith(join(cwd, 'task-'))).toBe(true);
    expect(manager.spawn).toHaveBeenCalledWith(expect.objectContaining({
      task: expect.stringContaining('including every output file it names'),
    }));
    await expect(stat(taskFile)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readdir(cwd)).toEqual(['task']);
    expect(await readFile(join(victimDir, 'review-task.md'), 'utf8')).toBe('untouched');
    jest.spyOn(manager, 'spawn').mockRejectedValue(new Error('small reached'));
    await expect(gateway.spawn({ laneId: 'codex', cwd, prompt: 'Short', signal: new AbortController().signal, repo: reviewRepo }))
      .rejects.toThrow('small reached');
    expect(manager.spawn).toHaveBeenLastCalledWith(expect.objectContaining({ task: 'Short' }));
  });
  it('reports cancellation separately from the polling deadline', async () => {
    const manager = Object.create(AgentProcessManager.prototype) as AgentProcessManager;
    const agentId = AgentId.create();
    jest.spyOn(manager, 'spawn').mockResolvedValue({ agentId, cli: 'codex', status: 'running', startedAt: new Date().toISOString() });
    const controller = new AbortController();
    jest.spyOn(manager, 'findAgentInfo').mockImplementation(() => {
      controller.abort();
      return { agentId, cli: 'codex', task: 'Review', workingDirectory: '/attempt', status: 'running', startedAt: new Date().toISOString() };
    });
    jest.spyOn(manager, 'stop').mockResolvedValue({ agentId, cli: 'codex', task: 'Review', workingDirectory: '/attempt', status: 'stopped', startedAt: new Date().toISOString() });
    const detection = Object.create(CliDetectionService.prototype) as CliDetectionService;
    jest.spyOn(detection, 'getInstalledClis').mockResolvedValue([{ cli: 'codex', installed: true, messagingMode: 'none' }]);
    const limits = Object.create(LaneLimitLookupService.prototype) as LaneLimitLookupService;
    jest.spyOn(limits, 'lookup').mockImplementation(async (rows) => rows.map((row) => ({
      row, lookup: 'ok' as const, state: { state: 'confirmed-room' as const, reasons: [], windows: [] },
    })));
    const environment = Object.create(AgentSpawnEnvironment.prototype) as AgentSpawnEnvironment;
    jest.spyOn(environment, 'resolveModel').mockReturnValue({ model: undefined, source: 'cli-default' });
    await expect(new ReviewLaneGateway(manager, detection, limits, environment)
      .spawn({ laneId: 'codex', cwd: '/attempt', prompt: 'Review', signal: controller.signal, repo: reviewRepo }))
      .rejects.toThrow('cancelled');
  });
  it('accepts completed status and releases the live process before its eventual exit', async () => {
    const manager = Object.create(AgentProcessManager.prototype) as AgentProcessManager;
    const agentId = AgentId.create();
    jest.spyOn(manager, 'spawn').mockResolvedValue({ agentId, cli: 'codex', status: 'running', startedAt: new Date().toISOString() });
    const completed = { agentId, cli: 'codex' as const, task: 'Review', workingDirectory: '/attempt',
      status: 'completed' as const, startedAt: new Date().toISOString() };
    jest.spyOn(manager, 'findAgentInfo').mockReturnValue(completed);
    const stop = jest.spyOn(manager, 'stop').mockResolvedValue(completed);
    const waitForAgents = jest.spyOn(manager, 'waitForAgents');
    const detection = Object.create(CliDetectionService.prototype) as CliDetectionService;
    jest.spyOn(detection, 'getInstalledClis').mockResolvedValue([{ cli: 'codex', installed: true, messagingMode: 'none' }]);
    const limits = Object.create(LaneLimitLookupService.prototype) as LaneLimitLookupService;
    jest.spyOn(limits, 'lookup').mockImplementation(async (rows) => rows.map((row) => ({
      row, lookup: 'ok' as const, state: { state: 'confirmed-room' as const, reasons: [], windows: [] },
    })));
    const environment = Object.create(AgentSpawnEnvironment.prototype) as AgentSpawnEnvironment;
    jest.spyOn(environment, 'resolveModel').mockReturnValue({ model: undefined, source: 'cli-default' });
    const gateway = new ReviewLaneGateway(manager, detection, limits, environment);
    await expect(gateway.spawn({ laneId: 'codex', cwd: '/attempt', prompt: 'Review', signal: new AbortController().signal, repo: reviewRepo }))
      .resolves.toEqual({ usage: expect.objectContaining({ partial: false }) });
    expect(manager.spawn).toHaveBeenCalledWith(expect.objectContaining({ attachMcp: false, deliverables: ['out/lane-output.json'] }));
    expect(stop).toHaveBeenCalledWith(agentId);
    expect(waitForAgents).not.toHaveBeenCalled();
  });
  it('withholds a lane known to be at its limit before spawning', async () => {
    const manager = Object.create(AgentProcessManager.prototype) as AgentProcessManager;
    const spawn = jest.spyOn(manager, 'spawn');
    const detection = Object.create(CliDetectionService.prototype) as CliDetectionService;
    jest.spyOn(detection, 'getInstalledClis').mockResolvedValue([
      { cli: 'codex', installed: true, messagingMode: 'none' },
    ]);
    const limits = Object.create(LaneLimitLookupService.prototype) as LaneLimitLookupService;
    jest.spyOn(limits, 'lookup').mockImplementation(async (rows) => rows.map((row) => ({
      row, lookup: 'ok' as const, state: { state: 'at-limit' as const, reasons: [], windows: [] },
    })));
    const environment = Object.create(AgentSpawnEnvironment.prototype) as AgentSpawnEnvironment;
    jest.spyOn(environment, 'resolveModel').mockReturnValue({ model: undefined, source: 'cli-default' });
    jest.spyOn(environment, 'maxConcurrentAgents').mockReturnValue(5);
    const gateway = new ReviewLaneGateway(manager, detection, limits, environment);

    expect(await gateway.list()).toEqual({ lanes: [{ id: 'codex', label: 'codex', family: 'codex', limitState: 'at-limit' }], maxConcurrentAgents: 5 });
    await expect(gateway.spawn({ laneId: 'codex', cwd: '/attempt/src', prompt: 'Review', signal: new AbortController().signal, repo: reviewRepo }))
      .rejects.toThrow('at its limit');
    expect(spawn).not.toHaveBeenCalled();
  });
  it('reports failed terminal status without waiting for process exit', async () => {
    const manager = Object.create(AgentProcessManager.prototype) as AgentProcessManager;
    const agentId = AgentId.create();
    jest.spyOn(manager, 'spawn').mockResolvedValue({ agentId, cli: 'codex', status: 'running', startedAt: new Date().toISOString() });
    jest.spyOn(manager, 'findAgentInfo').mockReturnValue({ agentId, cli: 'codex', task: 'Review', workingDirectory: '/attempt/src',
      status: 'failed', startedAt: new Date().toISOString(), exitCode: 7, failureKind: 'quota' });
    jest.spyOn(manager, 'stop').mockResolvedValue({ agentId, cli: 'codex', task: 'Review', workingDirectory: '/attempt/src',
      status: 'failed', startedAt: new Date().toISOString(), exitCode: 7, failureKind: 'quota' });
    const detection = Object.create(CliDetectionService.prototype) as CliDetectionService;
    jest.spyOn(detection, 'getInstalledClis').mockResolvedValue([{ cli: 'codex', installed: true, messagingMode: 'none' }]);
    const limits = Object.create(LaneLimitLookupService.prototype) as LaneLimitLookupService;
    jest.spyOn(limits, 'lookup').mockImplementation(async (rows) => rows.map((row) => ({
      row, lookup: 'timeout' as const, state: { state: 'unknown' as const, reasons: [], windows: [] },
    })));
    const environment = Object.create(AgentSpawnEnvironment.prototype) as AgentSpawnEnvironment;
    jest.spyOn(environment, 'resolveModel').mockReturnValue({ model: undefined, source: 'cli-default' });
    jest.spyOn(environment, 'maxConcurrentAgents').mockReturnValue(5);
    const waitForAgents = jest.spyOn(manager, 'waitForAgents');
    const gateway = new ReviewLaneGateway(manager, detection, limits, environment);
    await expect(gateway.spawn({ laneId: 'codex', cwd: '/attempt/src', prompt: 'Review', signal: new AbortController().signal, repo: reviewRepo }))
      .rejects.toThrow('status-failed: quota');
    expect(waitForAgents).not.toHaveBeenCalled();
  });

  it('flags a lane whose default model is on the block list (M3)', async () => {
    const manager = Object.create(AgentProcessManager.prototype) as AgentProcessManager;
    const detection = Object.create(CliDetectionService.prototype) as CliDetectionService;
    jest.spyOn(detection, 'getInstalledClis').mockResolvedValue([
      { cli: 'codex', installed: true, messagingMode: 'none' },
      { cli: 'copilot', installed: true, messagingMode: 'none' },
    ]);
    const limits = Object.create(LaneLimitLookupService.prototype) as LaneLimitLookupService;
    jest.spyOn(limits, 'lookup').mockImplementation(async (rows) => rows.map((row) => ({
      row, lookup: 'ok' as const, state: { state: 'confirmed-room' as const, reasons: [], windows: [] },
    })));
    const environment = Object.create(AgentSpawnEnvironment.prototype) as AgentSpawnEnvironment;
    jest.spyOn(environment, 'maxConcurrentAgents').mockReturnValue(5);
    const resolveModel = jest.spyOn(environment, 'resolveModel').mockImplementation((cli) =>
      cli === 'codex' ? { model: 'blocked-model', source: 'setting' } : { model: undefined, source: 'cli-default' });
    const { lanes } = await new ReviewLaneGateway(manager, detection, limits, environment).list();
    expect(lanes.map((lane) => [lane.id, lane.defaultModelBlocked ?? false])).toEqual([['codex', true], ['copilot', false]]);
    expect(resolveModel).toHaveBeenCalledWith('codex', undefined);
  });

  it('spawns when a limit lookup timed out', async () => {
    const manager = Object.create(AgentProcessManager.prototype) as AgentProcessManager;
    const spawn = jest.spyOn(manager, 'spawn').mockRejectedValue(new Error('spawn reached'));
    const detection = Object.create(CliDetectionService.prototype) as CliDetectionService;
    jest.spyOn(detection, 'getInstalledClis').mockResolvedValue([{ cli: 'codex', installed: true, messagingMode: 'none' }]);
    const limits = Object.create(LaneLimitLookupService.prototype) as LaneLimitLookupService;
    jest.spyOn(limits, 'lookup').mockImplementation(async (rows) => rows.map((row) => ({
      row, lookup: 'timeout' as const, state: { state: 'unknown' as const, reasons: [], windows: [] },
    })));
    const environment = Object.create(AgentSpawnEnvironment.prototype) as AgentSpawnEnvironment;
    jest.spyOn(environment, 'resolveModel').mockReturnValue({ model: undefined, source: 'cli-default' });
    jest.spyOn(environment, 'maxConcurrentAgents').mockReturnValue(5);
    const gateway = new ReviewLaneGateway(manager, detection, limits, environment);
    expect((await gateway.list()).lanes[0].limitState).toBe('unknown');
    await expect(gateway.spawn({ laneId: 'codex', cwd: '/attempt/src', prompt: 'Review', signal: new AbortController().signal, repo: reviewRepo }))
      .rejects.toThrow('spawn reached');
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});

describe('ReviewLaneGateway models', () => {
  function gatewayWith(listing?: LaneModelListing, manager = Object.create(AgentProcessManager.prototype) as AgentProcessManager) {
    const detection = Object.create(CliDetectionService.prototype) as CliDetectionService;
    jest.spyOn(detection, 'getInstalledClis').mockResolvedValue([
      { cli: 'codex', installed: true, messagingMode: 'none' },
      { cli: 'copilot', installed: true, messagingMode: 'none' },
    ]);
    const limits = Object.create(LaneLimitLookupService.prototype) as LaneLimitLookupService;
    jest.spyOn(limits, 'lookup').mockImplementation(async (rows) => rows.map((row) => ({
      row, lookup: 'ok' as const, state: { state: 'confirmed-room' as const, reasons: [], windows: [] },
    })));
    const environment = Object.create(AgentSpawnEnvironment.prototype) as AgentSpawnEnvironment;
    jest.spyOn(environment, 'resolveModel').mockReturnValue({ model: undefined, source: 'cli-default' });
    return new ReviewLaneGateway(manager, detection, limits, environment, undefined, undefined, undefined,
      listing ? () => listing : undefined);
  }
  const reported = (id: string): LaneModelEntry => ({ id, provenance: 'reported' });

  it('forwards a model as a typed spawn field, omits it without one, and rejects an over-long model', async () => {
    const manager = Object.create(AgentProcessManager.prototype) as AgentProcessManager;
    const spawn = jest.spyOn(manager, 'spawn').mockRejectedValue(new Error('spawn reached'));
    const gateway = gatewayWith(undefined, manager);
    const signal = new AbortController().signal;
    await expect(gateway.spawn({ laneId: 'codex', model: 'gpt-model', cwd: '/attempt', prompt: 'Review', signal, repo: reviewRepo }))
      .rejects.toThrow('spawn reached');
    expect(spawn).toHaveBeenLastCalledWith(expect.objectContaining({ cli: 'codex', model: 'gpt-model', task: 'Review' }));
    await expect(gateway.spawn({ laneId: 'codex', cwd: '/attempt', prompt: 'Review', signal, repo: reviewRepo })).rejects.toThrow('spawn reached');
    expect(spawn.mock.calls[1][0]).not.toHaveProperty('model');
    await expect(gateway.spawn({ laneId: 'codex', model: 'm'.repeat(201), cwd: '/attempt', prompt: 'Review', signal, repo: reviewRepo }))
      .rejects.toThrow();
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it('maps listings to read, empty and failed catalogs and drops blocked and invalid ids', async () => {
    const codexEntries: LaneModelEntry[] = [reported('gpt-model'), reported('blocked-model'), reported(' '), { id: 'tier', provenance: 'tier' }];
    const listing = { list: jest.fn<Promise<readonly LaneModelEntry[]>, Parameters<LaneModelListing['list']>>(
      async (row) => (row.cli === 'codex' ? codexEntries : [])) };
    const gateway = gatewayWith(listing);
    expect(await gateway.listModels(['codex', 'copilot', 'not-listed'], new AbortController().signal)).toEqual({
      codex: { status: 'read', models: ['gpt-model', 'tier'], truncated: false, verifiable: true },
      copilot: { status: 'empty', models: [], truncated: false, verifiable: false },
    });
    jest.mocked(listing.list).mockRejectedValue(new Error('offline'));
    expect(await gateway.listModels(['codex'], new AbortController().signal)).toEqual({
      codex: { status: 'failed', models: [], truncated: false, verifiable: false },
    });
  });

  it('does not mark a config-only list verifiable', async () => {
    const gateway = gatewayWith({ list: async () => [{ id: 'saved-model', provenance: 'configured' }] });
    expect(await gateway.listModels(['codex'], new AbortController().signal))
      .toEqual({ codex: { status: 'read', models: ['saved-model'], truncated: false, verifiable: false } });
  });

  it('truncates a long catalog to the bound and marks it unverifiable', async () => {
    const ids = Array.from({ length: REVIEW_LANE_CATALOG_MAX + 100 }, (_value, index) => reported(`model-${index}`));
    const gateway = gatewayWith({ list: async () => ids });
    const catalog = (await gateway.listModels(['codex'], new AbortController().signal))['codex'];
    expect(catalog.models).toHaveLength(REVIEW_LANE_CATALOG_MAX);
    expect(catalog).toMatchObject({ status: 'read', truncated: true, verifiable: false });
  });

  it('fails a listing that never settles once the signal aborts, without delaying the other lanes', async () => {
    const listing: LaneModelListing = { list: (row) => row.cli === 'codex'
      ? new Promise<readonly LaneModelEntry[]>(() => undefined) : Promise.resolve([reported('copilot-model')]) };
    const controller = new AbortController();
    const pending = gatewayWith(listing).listModels(['codex', 'copilot'], controller.signal);
    setTimeout(() => controller.abort(), 10);
    expect(await pending).toEqual({
      codex: { status: 'failed', models: [], truncated: false, verifiable: false },
      copilot: { status: 'read', models: ['copilot-model'], truncated: false, verifiable: true },
    });
  });

  it('reads no catalog without a model listing', async () => {
    expect(await gatewayWith().listModels(['codex'], new AbortController().signal)).toEqual({});
  });

  it('reports a model the lane block list refuses', () => {
    const gateway = gatewayWith();
    expect(gateway.modelBlocked('blocked-model')).toBe(true);
    expect(gateway.modelBlocked('gpt-model')).toBe(false);
  });
});

describe('ReviewLaneGateway lane usage', () => {
  type Usage = ReturnType<AgentProcessManager['findAgentUsage']>;
  const unread = { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, costUsd: null, model: null };

  function info(agentId: AgentId, status: AgentStatus, extra: Partial<AgentProcessInfo> = {}): AgentProcessInfo {
    return { agentId, cli: 'codex', task: 'Review', workingDirectory: '/attempt', status, startedAt: new Date().toISOString(), ...extra };
  }

  /** A gateway over one codex lane. `statuses` are returned by successive polls; the last one repeats. */
  function setup(options: {
    statuses?: AgentStatus[];
    failed?: Partial<AgentProcessInfo>;
    usage?: () => Usage;
    limit?: 'confirmed-room' | 'at-limit';
    resolveUsageWorkspace?: (repo: typeof reviewRepo, signal: AbortSignal) => Promise<string | null>;
    spawnImpl?: (signal: AbortController) => Promise<void>;
  } = {}) {
    const manager = Object.create(AgentProcessManager.prototype) as AgentProcessManager;
    const agentId = AgentId.create();
    const controller = new AbortController();
    const spawn = jest.spyOn(manager, 'spawn').mockImplementation(async () => {
      await options.spawnImpl?.(controller);
      return { agentId, cli: 'codex', status: 'running', startedAt: new Date().toISOString() };
    });
    const statuses = options.statuses ?? ['completed'];
    let poll = 0;
    jest.spyOn(manager, 'findAgentInfo').mockImplementation(() =>
      info(agentId, statuses[Math.min(poll++, statuses.length - 1)], options.failed));
    const findAgentUsage = jest.spyOn(manager, 'findAgentUsage').mockImplementation(options.usage ?? (() => undefined));
    const stop = jest.spyOn(manager, 'stop').mockResolvedValue(info(agentId, 'stopped'));
    const detection = Object.create(CliDetectionService.prototype) as CliDetectionService;
    const getInstalledClis = jest.spyOn(detection, 'getInstalledClis')
      .mockResolvedValue([{ cli: 'codex', installed: true, messagingMode: 'none' }]);
    const limits = Object.create(LaneLimitLookupService.prototype) as LaneLimitLookupService;
    const lookup = jest.spyOn(limits, 'lookup').mockImplementation(async (rows) => rows.map((row) => ({
      row, lookup: 'ok' as const, state: { state: options.limit ?? 'confirmed-room', reasons: [], windows: [] },
    })));
    const environment = Object.create(AgentSpawnEnvironment.prototype) as AgentSpawnEnvironment;
    jest.spyOn(environment, 'resolveModel').mockReturnValue({ model: undefined, source: 'cli-default' });
    const logger = { warn: jest.fn() };
    const gateway = new ReviewLaneGateway(manager, detection, limits, environment, undefined, undefined, logger, undefined,
      options.resolveUsageWorkspace);
    const run = (prompt = 'Review') => gateway.spawn({ laneId: 'codex', cwd: '/attempt', prompt, signal: controller.signal, repo: reviewRepo });
    return { manager, agentId, controller, spawn, stop, findAgentUsage, getInstalledClis, lookup, logger, run };
  }

  async function rejection(promise: Promise<unknown>): Promise<ReviewLaneSpawnError> {
    const error = await promise.then(() => undefined, (reason: unknown) => reason);
    expect(error).toBeInstanceOf(ReviewLaneSpawnError);
    return error as ReviewLaneSpawnError;
  }

  it('resolves a completed lane with its top-level usage; unread fields stay null, not 0', async () => {
    const h = setup({ usage: () => ({ inputTokens: 10 }) });
    await expect(h.run()).resolves.toEqual({ usage: { ...unread, inputTokens: 10, partial: false } });
    expect(h.stop).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['failed', { exitCode: 7, failureKind: 'quota' as const }, 'status-failed: quota'],
    ['stopped', {}, 'status-failed: stopped'],
    ['timeout', {}, 'timeout'],
  ] as const)('rejects a %s lane as started and partial, with its original message', async (status, failed, message) => {
    const h = setup({ statuses: [status], failed, usage: () => ({ inputTokens: 4 }) });
    const error = await rejection(h.run());
    expect(error).toMatchObject({ message, spawned: true, usage: { ...unread, inputTokens: 4, partial: true } });
  });

  it('rejects a lane past its polling deadline as started', async () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValueOnce(now).mockReturnValue(now + 15 * 60_000);
    try {
      const h = setup({ statuses: ['running'] });
      const error = await rejection(h.run());
      expect(error).toMatchObject({ message: 'timeout', spawned: true, usage: { ...unread, partial: true } });
    } finally {
      clock.mockRestore();
    }
  });

  it('rejects an abort while polling as started and partial', async () => {
    const h = setup({ statuses: ['running'], usage: () => ({ outputTokens: 3 }) });
    jest.mocked(h.manager.findAgentInfo).mockImplementation(() => {
      h.controller.abort();
      return info(h.agentId, 'running');
    });
    const error = await rejection(h.run());
    expect(error).toMatchObject({ message: 'cancelled', spawned: true, usage: { ...unread, outputTokens: 3, partial: true } });
  });

  it('rejects an unavailable or at-limit lane as not started', async () => {
    const atLimit = setup({ limit: 'at-limit' });
    expect(await rejection(atLimit.run())).toMatchObject({ message: 'Review lane is at its limit', spawned: false, usage: null });
    expect(atLimit.spawn).not.toHaveBeenCalled();
    const unavailable = setup();
    unavailable.getInstalledClis.mockResolvedValue([]);
    expect(await rejection(unavailable.run())).toMatchObject({ message: 'Review lane unavailable', spawned: false });
    expect(unavailable.spawn).not.toHaveBeenCalled();
  });

  it('rejects every failure before an agent exists as not started (F1)', async () => {
    const invalid = setup();
    expect(await rejection(invalid.run('x'.repeat(200_001)))).toMatchObject({ name: 'ZodError', spawned: false, usage: null });
    const detection = setup();
    detection.getInstalledClis.mockRejectedValue(new Error('detection failed'));
    expect(await rejection(detection.run())).toMatchObject({ message: 'detection failed', spawned: false });
    const lookup = setup();
    lookup.lookup.mockRejectedValue(new Error('lookup failed'));
    expect(await rejection(lookup.run())).toMatchObject({ message: 'lookup failed', spawned: false });
    for (const h of [invalid, detection, lookup]) expect(h.spawn).not.toHaveBeenCalled();
    const rejected = setup();
    rejected.spawn.mockRejectedValue(new Error('spawn refused'));
    expect(await rejection(rejected.run())).toMatchObject({ message: 'spawn refused', spawned: false, usage: null });
  });

  it('stops once and keeps usage when the signal aborts during manager.spawn (F3)', async () => {
    const h = setup({ spawnImpl: async (controller) => controller.abort(), usage: () => ({ inputTokens: 2 }) });
    const error = await rejection(h.run());
    expect(error).toMatchObject({ message: 'Review lane cancelled', spawned: true, usage: { ...unread, inputTokens: 2, partial: true } });
    expect(h.stop).toHaveBeenCalledTimes(1);
  });

  it('keeps the timeout and the last usage when stop throws after it (F2)', async () => {
    let reads = 0;
    const h = setup({ statuses: ['timeout'], usage: () => (++reads <= 2 ? { inputTokens: 6 } : undefined) });
    h.stop.mockRejectedValue(new Error('stop failed'));
    const error = await rejection(h.run());
    expect(error).toMatchObject({ message: 'timeout', spawned: true, usage: { ...unread, inputTokens: 6, partial: true } });
    expect(h.logger.warn).toHaveBeenCalledTimes(1);
    expect(h.logger.warn).toHaveBeenCalledWith('[ReviewLaneGateway] Lane stop failed', { error: 'stop failed' });
  });

  it('rejects a completed lane whose stop throws, as started (F2)', async () => {
    const h = setup({ usage: () => ({ inputTokens: 1 }) });
    h.stop.mockRejectedValue(new Error('stop failed'));
    expect(await rejection(h.run())).toMatchObject({ message: 'stop failed', spawned: true, usage: { ...unread, inputTokens: 1, partial: true } });
  });

  it('keeps the newest polled usage when the record reads empty after stop (A11)', async () => {
    let stopped = false;
    let reads = 0;
    const h = setup({ statuses: ['running', 'completed'],
      usage: () => (stopped ? undefined : { inputTokens: ++reads === 1 ? 5 : 9 }) });
    h.stop.mockImplementation(async () => { stopped = true; return info(h.agentId, 'completed'); });
    await expect(h.run()).resolves.toEqual({ usage: { ...unread, inputTokens: 9, partial: false } });
  });

  it('reads no counter from per-model rows (A12) and drops invalid fields', async () => {
    const h = setup({ usage: () => ({ models: [{ modelId: 'm', inputTokens: 5, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 }] }) });
    await expect(h.run()).resolves.toEqual({ usage: { ...unread, partial: false } });
    const invalid = setup({ usage: () => ({ inputTokens: -1, outputTokens: 1.5, costUsd: 0.25, model: 'gpt-model' }) });
    await expect(invalid.run()).resolves.toEqual({ usage: { ...unread, costUsd: 0.25, model: 'gpt-model', partial: false } });
  });

  it('gives unknown usage when the usage read throws (Req 1.4)', async () => {
    const h = setup({ usage: () => { throw new Error('read failed'); } });
    await expect(h.run()).resolves.toEqual({ usage: { ...unread, partial: false } });
  });

  it('keys the usage rows by the workspace folder that is the checkout (Req 6.1)', async () => {
    const environment = { resolve: jest.fn(), checkoutRoot: async () => '/repos/ptah' };
    const resolveUsageWorkspace = jest.fn((repo: typeof reviewRepo) => findRepositoryWorkspaceFolder({
      environment, repo, folders: ['/repos/other', '/repos/ptah'], realpath: async (folder) => folder }));
    const h = setup({ resolveUsageWorkspace });
    await h.run();
    expect(resolveUsageWorkspace).toHaveBeenCalledWith(reviewRepo, h.controller.signal);
    expect(h.spawn).toHaveBeenCalledWith(expect.objectContaining({ usageWorkspaceRoot: '/repos/ptah' }));
  });

  it('sends the registered folder string as returned, not its realpath or a normalized form (M3b)', async () => {
    // The ledger keys rows by this raw string, so it must equal the registered folder byte for byte.
    const registered = 'D:\\Links\\PtahCode\\';
    const environment = { resolve: jest.fn(), checkoutRoot: async () => '/repos/ptah' };
    const h = setup({ resolveUsageWorkspace: (repo) => findRepositoryWorkspaceFolder({
      environment, repo, folders: ['/repos/other', registered],
      realpath: async (folder) => (folder === registered ? '/repos/ptah' : folder) }) });
    await h.run();
    expect(h.spawn.mock.calls[0][0].usageWorkspaceRoot).toBe(registered);
  });

  it('omits the folder when none matches or the lookup fails (Req 6.5)', async () => {
    const none = setup({ resolveUsageWorkspace: async () => null });
    await none.run();
    expect(none.spawn.mock.calls[0][0]).not.toHaveProperty('usageWorkspaceRoot');
    const failing = setup({ resolveUsageWorkspace: async () => { throw new Error('lookup failed'); } });
    await expect(failing.run()).resolves.toBeDefined();
    expect(failing.spawn.mock.calls[0][0]).not.toHaveProperty('usageWorkspaceRoot');
    expect(failing.logger.warn).toHaveBeenCalledWith('[ReviewLaneGateway] Review usage folder lookup failed', { error: 'lookup failed' });
  });
});

