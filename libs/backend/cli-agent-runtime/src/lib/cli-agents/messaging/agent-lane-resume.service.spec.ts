import { AgentId, type AgentProcessInfo } from '@ptah-extension/shared';
import { AgentLaneResumeService } from './agent-lane-resume.service';

const ptahCli = () => ({ resume: jest.fn(), resumePtahCli: jest.fn() });

describe('AgentLaneResumeService', () => {
  const info = { agentId: AgentId.create(), cli: 'codex', status: 'completed', task: 'original',
    workingDirectory: '.', cliSessionId: 'session', parentSessionId: 'parent' } as AgentProcessInfo;

  it('caps an explicit resume using the live parent level', async () => {
    const spawn = jest.fn().mockResolvedValue({ agentId: AgentId.create() });
    const resume = new AgentLaneResumeService({ spawn, prepareSdkHandleSpawn: jest.fn(), releaseIdleForResume: jest.fn() }, ptahCli(),
      (id) => id === 'parent' ? 'plan' : undefined);
    await resume.resumeRequest({ cli: 'codex', task: 'continue', workingDirectory: '.', resumeSessionId: 'session', parentSessionId: 'parent' });
    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ parentLevel: 'plan' }));
  });

  it('keeps an explicitly parentless resume parentless', async () => {
    const spawn = jest.fn().mockResolvedValue({ agentId: AgentId.create() });
    const lookup = jest.fn(() => 'plan' as const);
    const resume = new AgentLaneResumeService({ spawn, prepareSdkHandleSpawn: jest.fn(), releaseIdleForResume: jest.fn() }, ptahCli(), lookup);
    await resume.resumeRequest({ cli: 'codex', task: 'continue', workingDirectory: '.', resumeSessionId: 'session' });
    expect(lookup).not.toHaveBeenCalled();
    expect(spawn.mock.calls[0][0].parentSessionId).toBeUndefined();
    expect(spawn.mock.calls[0][0].parentLevel).toBeUndefined();
  });

  it('uses the manager resume gate and forwards the original session', async () => {
    const spawn = jest.fn().mockResolvedValue({ agentId: AgentId.create() });
    const releaseIdleForResume = jest.fn().mockResolvedValue(undefined);
    const resume = new AgentLaneResumeService({ spawn, prepareSdkHandleSpawn: jest.fn(), releaseIdleForResume }, ptahCli());
    await resume.resume(info, 'follow up');
    expect(releaseIdleForResume).toHaveBeenCalledWith(info.agentId);
    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({
      cli: 'codex', resumeSessionId: 'session', task: 'follow up', parentSessionId: 'parent',
      resumedFromAgentId: info.agentId,
    }));
  });

  it('waits for the old live handle to release before spawning a replacement', async () => {
    let completeRelease: (() => void) | undefined;
    const releaseIdleForResume = jest.fn(() => new Promise<void>((resolve) => {
      completeRelease = resolve;
    }));
    const spawn = jest.fn().mockResolvedValue({ agentId: AgentId.create() });
    const resume = new AgentLaneResumeService({ spawn, prepareSdkHandleSpawn: jest.fn(), releaseIdleForResume }, ptahCli());
    const result = resume.resume(info, 'follow up');
    expect(spawn).not.toHaveBeenCalled();
    completeRelease?.();
    await result;
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('refuses a record without a session', async () => {
    const spawn = jest.fn();
    const resume = new AgentLaneResumeService({ spawn, prepareSdkHandleSpawn: jest.fn(), releaseIdleForResume: jest.fn() }, ptahCli());
    await expect(resume.resume({ ...info, cliSessionId: undefined }, 'follow up')).rejects.toThrow('No CLI session');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('replays effective permission and network restrictions on cold resume', async () => {
    const spawn = jest.fn().mockResolvedValue({ agentId: AgentId.create() });
    const resume = new AgentLaneResumeService({ spawn, prepareSdkHandleSpawn: jest.fn(), releaseIdleForResume: jest.fn() }, ptahCli());
    await resume.resume({ ...info, effectivePolicy: { permission: 'plan', network: 'deny' } }, 'follow up');
    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ permission: 'plan', network: 'deny' }));
  });

  it('prepares an explicit Ptah CLI resume through the manager gate', async () => {
    const prepareSdkHandleSpawn = jest.fn().mockResolvedValue({ task: 'follow up', resumeSessionId: 'session' });
    const resume = new AgentLaneResumeService({ spawn: jest.fn(), prepareSdkHandleSpawn, releaseIdleForResume: jest.fn() }, ptahCli());
    await expect(resume.prepareSdkResume({ cli: 'ptah-cli', task: 'follow up', resumeSessionId: 'session' }))
      .resolves.toEqual({ task: 'follow up', resumeSessionId: 'session' });
    expect(prepareSdkHandleSpawn).toHaveBeenCalledWith({
      cli: 'ptah-cli', task: 'follow up', resumeSessionId: 'session',
    });
  });

  it('routes every Ptah CLI lane through the required Ptah resumer', async () => {
    const spawn = jest.fn();
    const ptah = ptahCli();
    ptah.resume.mockResolvedValue({ agentId: AgentId.create() });
    const resume = new AgentLaneResumeService({ spawn, prepareSdkHandleSpawn: jest.fn(), releaseIdleForResume: jest.fn() }, ptah);
    const ptahInfo = { ...info, cli: 'ptah-cli', ptahCliId: 'config' } as AgentProcessInfo;
    await resume.resume(ptahInfo, 'follow up');
    expect(ptah.resume).toHaveBeenCalledWith(ptahInfo, 'follow up');
    expect(spawn).not.toHaveBeenCalled();
  });
});
