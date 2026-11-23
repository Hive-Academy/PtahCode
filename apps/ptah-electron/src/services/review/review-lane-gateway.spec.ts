import { AgentProcessManager, AgentSpawnEnvironment, CliDetectionService, LaneLimitLookupService } from '@ptah-extension/cli-agent-runtime';
import { AgentId } from '@ptah-extension/shared';
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
    await expect(gateway.spawn({ laneId: 'ptah-cli:agent-1', cwd: '/attempt', prompt: 'Review', signal: new AbortController().signal }))
      .rejects.toThrow('spawn reached');
    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ cli: 'ptah-cli', ptahCliId: 'agent-1' }));
    disabled = ['copilot', 'codex'];
    await expect(gateway.spawn({ laneId: 'codex', cwd: '/attempt', prompt: 'Review', signal: new AbortController().signal }))
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
    await expect(gateway.spawn({ laneId: 'codex', cwd, prompt, signal: new AbortController().signal }))
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
    await expect(gateway.spawn({ laneId: 'codex', cwd, prompt: 'Short', signal: new AbortController().signal }))
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
      .spawn({ laneId: 'codex', cwd: '/attempt', prompt: 'Review', signal: controller.signal }))
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
    await expect(gateway.spawn({ laneId: 'codex', cwd: '/attempt', prompt: 'Review', signal: new AbortController().signal }))
      .resolves.toBeUndefined();
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
    await expect(gateway.spawn({ laneId: 'codex', cwd: '/attempt/src', prompt: 'Review', signal: new AbortController().signal }))
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
    await expect(gateway.spawn({ laneId: 'codex', cwd: '/attempt/src', prompt: 'Review', signal: new AbortController().signal }))
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
    await expect(gateway.spawn({ laneId: 'codex', cwd: '/attempt/src', prompt: 'Review', signal: new AbortController().signal }))
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
    await expect(gateway.spawn({ laneId: 'codex', model: 'gpt-model', cwd: '/attempt', prompt: 'Review', signal }))
      .rejects.toThrow('spawn reached');
    expect(spawn).toHaveBeenLastCalledWith(expect.objectContaining({ cli: 'codex', model: 'gpt-model', task: 'Review' }));
    await expect(gateway.spawn({ laneId: 'codex', cwd: '/attempt', prompt: 'Review', signal })).rejects.toThrow('spawn reached');
    expect(spawn.mock.calls[1][0]).not.toHaveProperty('model');
    await expect(gateway.spawn({ laneId: 'codex', model: 'm'.repeat(201), cwd: '/attempt', prompt: 'Review', signal }))
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
