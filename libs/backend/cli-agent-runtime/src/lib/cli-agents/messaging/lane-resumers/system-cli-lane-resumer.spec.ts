import { AgentId, type AgentProcessInfo } from '@ptah-extension/shared';
import { LaneResumeError } from './lane-resumer.port';
import { SystemCliLaneResumer } from './system-cli-lane-resumer';
import { LaneSpawnPolicyError } from '../../lane-spawn-policy';

const AGENT_ID = AgentId.from('aaaaaaaa-bbbb-4ccc-8ddd-000000000101');
const NEW_AGENT_ID = AgentId.from('aaaaaaaa-bbbb-4ccc-8ddd-000000000102');
const info: AgentProcessInfo = {
  agentId: AGENT_ID,
  cli: 'codex',
  task: 'original',
  workingDirectory: '/worktree',
  status: 'completed',
  startedAt: '2026-11-07T00:00:00.000Z',
  cliSessionId: 'cli-session',
  parentSessionId: 'parent-session',
  effectivePolicy: { permission: 'plan', network: 'deny' },
};

describe('SystemCliLaneResumer', () => {
  it('passes the turn images to the spawn as turnImages', async () => {
    const spawn = jest.fn(async () => ({ agentId: NEW_AGENT_ID, cli: 'claude' as const, status: 'running' as const, startedAt: 'now' }));
    const resumer = new SystemCliLaneResumer({ spawn, releaseIdleForResume: jest.fn(async () => undefined) });
    const images = [{ data: 'iVBORw0KGgo=', mediaType: 'image/png' }];
    await resumer.resume({ ...info, cli: 'claude' }, 'look', undefined, images);
    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ turnImages: images }));
  });

  it('turns a lane policy refusal into a non-retryable policy-refused error (L12)', async () => {
    const spawn = jest.fn(async () => {
      throw new LaneSpawnPolicyError({ code: 'UNSUPPORTED_LANE_POLICY', field: 'permission', cli: 'grok',
        requested: { permission: 'plan' },
        reason: 'Parent plan cap permission: Grok exposes no native read-only plan flag.' });
    });
    const resumer = new SystemCliLaneResumer({ spawn, releaseIdleForResume: jest.fn(async () => undefined) });
    await expect(resumer.resume({ ...info, cli: 'grok' }, 'continue')).rejects.toMatchObject({
      code: 'policy-refused',
      message: 'Parent plan cap permission: Grok exposes no native read-only plan flag.',
    });
  });

  it('uses the current parent level on cold resume', async () => {
    const spawn = jest.fn(async () => ({ agentId: NEW_AGENT_ID, cli: 'codex' as const, status: 'running' as const, startedAt: 'now' }));
    const resumer = new SystemCliLaneResumer({ spawn, releaseIdleForResume: jest.fn(async () => undefined) },
      (id) => id === 'parent-session' ? 'plan' : undefined);
    await resumer.resume({ ...info, effectivePolicy: { permission: 'yolo', network: 'allow' } }, 'continue');
    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ parentLevel: 'plan' }));
  });
  it('keeps the parent and marks the previous agent on resume', async () => {
    const releaseIdleForResume = jest.fn(async () => undefined);
    const spawn = jest.fn(async () => ({
      agentId: NEW_AGENT_ID,
      cli: 'codex' as const,
      status: 'running' as const,
      startedAt: '2026-11-07T00:01:00.000Z',
      cliSessionId: 'cli-session',
    }));
    const resumer = new SystemCliLaneResumer({ spawn, releaseIdleForResume });

    await expect(resumer.resume(info, 'continue')).resolves.toMatchObject({
      agentId: NEW_AGENT_ID,
      cliSessionId: 'cli-session',
    });
    expect(releaseIdleForResume).toHaveBeenCalledWith(AGENT_ID);
    expect(spawn).toHaveBeenCalledWith({
      cli: 'codex',
      task: 'continue',
      workingDirectory: '/worktree',
      resumeSessionId: 'cli-session',
      parentSessionId: 'parent-session',
      ptahCliId: undefined,
      resumedFromAgentId: AGENT_ID,
      permission: 'plan',
      network: 'deny',
      resumePolicy: { permission: 'plan', network: 'deny' },
    });
  });

  it('passes a restored plan snapshot through even when the requested policy was yolo', async () => {
    const spawn = jest.fn(async () => ({ agentId: NEW_AGENT_ID, cli: 'codex' as const, status: 'running' as const, startedAt: 'now' }));
    const resumer = new SystemCliLaneResumer({ spawn, releaseIdleForResume: jest.fn(async () => undefined) });

    await resumer.resume({ ...info, effectivePolicy: { permission: 'plan' }, requestedPolicy: { permission: 'yolo' } }, 'continue');

    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({
      permission: 'plan', resumePolicy: { permission: 'plan' },
    }));
  });

  it('raises LaneResumeError when the spawn fails', async () => {
    const resumer = new SystemCliLaneResumer({
      releaseIdleForResume: jest.fn(async () => undefined),
      spawn: jest.fn(async () => {
        throw new Error('provider unavailable');
      }),
    });

    const failure = resumer.resume(info, 'continue');
    await expect(failure).rejects.toBeInstanceOf(LaneResumeError);
    await expect(failure).rejects.toMatchObject({
      code: 'spawn-failed',
      message: 'provider unavailable',
    });
  });

  it('raises a no-session LaneResumeError before release or spawn', async () => {
    const releaseIdleForResume = jest.fn(async () => undefined);
    const spawn = jest.fn();
    const resumer = new SystemCliLaneResumer({ spawn, releaseIdleForResume });

    await expect(
      resumer.resume({ ...info, cliSessionId: undefined }, 'continue'),
    ).rejects.toMatchObject({ code: 'no-session' });
    expect(releaseIdleForResume).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });
});
