import { AgentProcessManager, AgentSpawnEnvironment, CliDetectionService, LaneLimitLookupService } from '@ptah-extension/cli-agent-runtime';
import { AgentId } from '@ptah-extension/shared';
import { ReviewLaneGateway } from './review-lane-gateway';
import { mkdtemp, readdir, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IWorkspaceProvider } from '@ptah-extension/platform-core';

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
    jest.spyOn(environment, 'maxConcurrentAgents').mockReturnValue(5);
    const gateway = new ReviewLaneGateway(manager, detection, limits, environment);

    expect(await gateway.list()).toEqual({ lanes: [{ id: 'codex', family: 'codex', limitState: 'at-limit' }], maxConcurrentAgents: 5 });
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
    jest.spyOn(environment, 'maxConcurrentAgents').mockReturnValue(5);
    const waitForAgents = jest.spyOn(manager, 'waitForAgents');
    const gateway = new ReviewLaneGateway(manager, detection, limits, environment);
    await expect(gateway.spawn({ laneId: 'codex', cwd: '/attempt/src', prompt: 'Review', signal: new AbortController().signal }))
      .rejects.toThrow('status-failed: quota');
    expect(waitForAgents).not.toHaveBeenCalled();
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
    jest.spyOn(environment, 'maxConcurrentAgents').mockReturnValue(5);
    const gateway = new ReviewLaneGateway(manager, detection, limits, environment);
    expect((await gateway.list()).lanes[0].limitState).toBe('unknown');
    await expect(gateway.spawn({ laneId: 'codex', cwd: '/attempt/src', prompt: 'Review', signal: new AbortController().signal }))
      .rejects.toThrow('spawn reached');
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});
