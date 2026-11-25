import { AgentId, type AgentProcessInfo } from '@ptah-extension/shared';
import { AgentLaneResumeService } from './agent-lane-resume.service';

const ptahCli = () => ({ resume: jest.fn(), resumePtahCli: jest.fn() });

describe('AgentLaneResumeService', () => {
  const info = { agentId: AgentId.create(), cli: 'codex', status: 'completed', task: 'original',
    workingDirectory: '.', cliSessionId: 'session', parentSessionId: 'parent' } as AgentProcessInfo;

  it('caps an explicit resume using the live parent level', async () => {
    const spawn = jest.fn().mockResolvedValue({ agentId: AgentId.create() });
    const resume = new AgentLaneResumeService({ spawn, prepareSdkHandleSpawn: jest.fn(), findAgentInfo: jest.fn(), releaseIdleForResume: jest.fn() }, ptahCli(),
      (id) => id === 'parent' ? 'plan' : undefined);
    await resume.resumeRequest({ cli: 'codex', task: 'continue', workingDirectory: '.', resumeSessionId: 'session', parentSessionId: 'parent' });
    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ parentLevel: 'plan' }));
  });

  it('drops the host-internal usage workspace root before spawning', async () => {
    const spawn = jest.fn().mockResolvedValue({ agentId: AgentId.create() });
    const resume = new AgentLaneResumeService({ spawn, prepareSdkHandleSpawn: jest.fn(), findAgentInfo: jest.fn(), releaseIdleForResume: jest.fn() }, ptahCli());
    await resume.resumeRequest({ cli: 'codex', task: 'continue', workingDirectory: '.', resumeSessionId: 'session', usageWorkspaceRoot: 'D:/other' });
    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ resumeSessionId: 'session', workingDirectory: '.' }));
    expect(spawn.mock.calls[0][0]).not.toHaveProperty('usageWorkspaceRoot');
  });

  it('keeps an explicitly parentless resume parentless', async () => {
    const spawn = jest.fn().mockResolvedValue({ agentId: AgentId.create() });
    const lookup = jest.fn(() => 'plan' as const);
    const resume = new AgentLaneResumeService({ spawn, prepareSdkHandleSpawn: jest.fn(), findAgentInfo: jest.fn(), releaseIdleForResume: jest.fn() }, ptahCli(), lookup);
    await resume.resumeRequest({ cli: 'codex', task: 'continue', workingDirectory: '.', resumeSessionId: 'session' });
    expect(lookup).not.toHaveBeenCalled();
    expect(spawn.mock.calls[0][0].parentSessionId).toBeUndefined();
    expect(spawn.mock.calls[0][0].parentLevel).toBeUndefined();
  });

  it('uses the manager resume gate and forwards the original session', async () => {
    const spawn = jest.fn().mockResolvedValue({ agentId: AgentId.create() });
    const releaseIdleForResume = jest.fn().mockResolvedValue(undefined);
    const resume = new AgentLaneResumeService({ spawn, prepareSdkHandleSpawn: jest.fn(), findAgentInfo: jest.fn(), releaseIdleForResume }, ptahCli());
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
    const resume = new AgentLaneResumeService({ spawn, prepareSdkHandleSpawn: jest.fn(), findAgentInfo: jest.fn(), releaseIdleForResume }, ptahCli());
    const result = resume.resume(info, 'follow up');
    expect(spawn).not.toHaveBeenCalled();
    completeRelease?.();
    await result;
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('forwards held images of a cold send to the resumed spawn (L3)', async () => {
    const spawn = jest.fn().mockResolvedValue({ agentId: AgentId.create() });
    const resume = new AgentLaneResumeService({ spawn, prepareSdkHandleSpawn: jest.fn(), findAgentInfo: jest.fn(),
      releaseIdleForResume: jest.fn().mockResolvedValue(undefined) }, ptahCli());
    const images = [{ data: 'iVBORw0KGgo=', mediaType: 'image/png' }];
    await resume.resume({ ...info, cli: 'claude' }, 'look', undefined, undefined, images);
    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ cli: 'claude', task: 'look', turnImages: images }));
  });

  it('refuses images on a Ptah CLI cold resume before any spawn', async () => {
    const ptah = ptahCli();
    const resume = new AgentLaneResumeService({ spawn: jest.fn(), prepareSdkHandleSpawn: jest.fn(), findAgentInfo: jest.fn(),
      releaseIdleForResume: jest.fn() }, ptah);
    await expect(resume.resume({ ...info, cli: 'ptah-cli' }, 'look', undefined, undefined,
      [{ data: 'x', mediaType: 'image/png' }])).rejects.toMatchObject({ code: 'turn-input-refused' });
    expect(ptah.resume).not.toHaveBeenCalled();
  });

  describe('resume model (F1)', () => {
    const claude = { ...info, cli: 'claude' } as AgentProcessInfo;
    const manager = (spawn: jest.Mock, findAgentInfo: jest.Mock = jest.fn()) => ({
      spawn, prepareSdkHandleSpawn: jest.fn(), findAgentInfo,
      releaseIdleForResume: jest.fn().mockResolvedValue(undefined),
    });

    it('resumes a Claude lane with no stored model on the model it last ran', async () => {
      const spawn = jest.fn().mockResolvedValue({ agentId: AgentId.create() });
      const lastModel = jest.fn(async () => 'claude-haiku-4-5-20251001');
      const resume = new AgentLaneResumeService(manager(spawn), ptahCli(), undefined, lastModel);
      await resume.resume(claude, 'Reply OK.');
      expect(lastModel).toHaveBeenCalledWith(claude);
      expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-haiku-4-5-20251001' }));
    });

    it('keeps a stored model and never looks the last one up', async () => {
      const spawn = jest.fn().mockResolvedValue({ agentId: AgentId.create() });
      const lastModel = jest.fn(async () => 'claude-opus-5-5');
      const resume = new AgentLaneResumeService(manager(spawn), ptahCli(), undefined, lastModel);
      await resume.resume({ ...claude, model: 'claude-haiku-4-5' }, 'Reply OK.');
      expect(lastModel).not.toHaveBeenCalled();
      expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-haiku-4-5' }));
    });

    it('leaves the model unset when nothing is known, and never looks up other CLIs', async () => {
      const spawn = jest.fn().mockResolvedValue({ agentId: AgentId.create() });
      const lastModel = jest.fn(async () => undefined);
      const resume = new AgentLaneResumeService(manager(spawn), ptahCli(), undefined, lastModel);
      await resume.resume(claude, 'Reply OK.');
      expect(spawn.mock.calls[0][0]).not.toHaveProperty('model');
      await resume.resume(info, 'follow up');
      expect(lastModel).toHaveBeenCalledTimes(1);
    });

    it('fills the model of an explicit resume from the record it resumes', async () => {
      const spawn = jest.fn().mockResolvedValue({ agentId: AgentId.create() });
      const lastModel = jest.fn(async () => 'claude-haiku-4-5-20251001');
      const find = jest.fn(() => claude);
      const resume = new AgentLaneResumeService(manager(spawn, find), ptahCli(), undefined, lastModel);
      await resume.resumeRequest({ cli: 'claude', task: 'continue', workingDirectory: '.',
        resumeSessionId: 'session', resumedFromAgentId: claude.agentId });
      expect(find).toHaveBeenCalledWith(claude.agentId);
      expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-haiku-4-5-20251001' }));
    });
  });

  it('refuses a record without a session', async () => {
    const spawn = jest.fn();
    const resume = new AgentLaneResumeService({ spawn, prepareSdkHandleSpawn: jest.fn(), findAgentInfo: jest.fn(), releaseIdleForResume: jest.fn() }, ptahCli());
    await expect(resume.resume({ ...info, cliSessionId: undefined }, 'follow up')).rejects.toThrow('No CLI session');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('replays effective permission and network restrictions on cold resume', async () => {
    const spawn = jest.fn().mockResolvedValue({ agentId: AgentId.create() });
    const resume = new AgentLaneResumeService({ spawn, prepareSdkHandleSpawn: jest.fn(), findAgentInfo: jest.fn(), releaseIdleForResume: jest.fn() }, ptahCli());
    await resume.resume({ ...info, effectivePolicy: { permission: 'plan', network: 'deny' } }, 'follow up');
    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ permission: 'plan', network: 'deny' }));
  });

  it('prepares an explicit Ptah CLI resume through the manager gate', async () => {
    const prepareSdkHandleSpawn = jest.fn().mockResolvedValue({ task: 'follow up', resumeSessionId: 'session' });
    const resume = new AgentLaneResumeService({ spawn: jest.fn(), prepareSdkHandleSpawn, findAgentInfo: jest.fn(), releaseIdleForResume: jest.fn() }, ptahCli());
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
    const resume = new AgentLaneResumeService({ spawn, prepareSdkHandleSpawn: jest.fn(), findAgentInfo: jest.fn(), releaseIdleForResume: jest.fn() }, ptah);
    const ptahInfo = { ...info, cli: 'ptah-cli', ptahCliId: 'config' } as AgentProcessInfo;
    await resume.resume(ptahInfo, 'follow up');
    expect(ptah.resume).toHaveBeenCalledWith(ptahInfo, 'follow up');
    expect(spawn).not.toHaveBeenCalled();
  });

  describe('blocked-command guard and turn settings', () => {
    const guard = { rawBody: '  /always-approve on', blocked: ['always-approve'] };

    it('refuses a blocked /command before any spawn', async () => {
      const spawn = jest.fn();
      const prepareSdkHandleSpawn = jest.fn();
      const ptah = ptahCli();
      const resume = new AgentLaneResumeService({ spawn, prepareSdkHandleSpawn, findAgentInfo: jest.fn(), releaseIdleForResume: jest.fn() }, ptah);
      for (const record of [info, { ...info, cli: 'ptah-cli', ptahCliId: 'config' } as AgentProcessInfo]) {
        await expect(resume.resume(record, '[Ptah message]\n/always-approve on', guard)).rejects.toMatchObject({
          name: 'LaneResumeError', code: 'blocked-command',
          message: 'Ptah does not allow /always-approve in a lane: its approval mode is set at spawn.',
        });
      }
      expect(spawn).not.toHaveBeenCalled();
      expect(prepareSdkHandleSpawn).not.toHaveBeenCalled();
      expect(ptah.resume).not.toHaveBeenCalled();
    });

    it('spawns a normal body and carries model, effort and files (A11)', async () => {
      const spawn = jest.fn().mockResolvedValue({ agentId: AgentId.create() });
      const resume = new AgentLaneResumeService({ spawn, prepareSdkHandleSpawn: jest.fn(), findAgentInfo: jest.fn(), releaseIdleForResume: jest.fn() }, ptahCli());
      await resume.resume({ ...info, model: 'gpt-5', reasoningEffort: 'high' }, 'follow up',
        { rawBody: 'follow up', blocked: ['always-approve'] }, ['src/a.ts']);
      expect(spawn).toHaveBeenCalledWith(expect.objectContaining({
        task: 'follow up', model: 'gpt-5', effort: 'high', files: ['src/a.ts'],
      }));
    });

    it('passes files to the Ptah CLI resumer only when present', async () => {
      const ptah = ptahCli();
      ptah.resume.mockResolvedValue({ agentId: AgentId.create() });
      const resume = new AgentLaneResumeService({ spawn: jest.fn(), prepareSdkHandleSpawn: jest.fn(), findAgentInfo: jest.fn(), releaseIdleForResume: jest.fn() }, ptah);
      const ptahInfo = { ...info, cli: 'ptah-cli', ptahCliId: 'config' } as AgentProcessInfo;
      await resume.resume(ptahInfo, 'follow up', undefined, ['a.ts']);
      expect(ptah.resume).toHaveBeenCalledWith(ptahInfo, 'follow up', ['a.ts']);
    });
  });
});
