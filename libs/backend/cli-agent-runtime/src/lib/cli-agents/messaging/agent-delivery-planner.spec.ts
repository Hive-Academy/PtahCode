import { AgentId, type AgentProcessInfo, type EffectiveLaneCapabilities } from '@ptah-extension/shared';
import { planAgentDelivery, TURN_INPUT_NOT_REPORTED, turnInputRefusal } from './agent-delivery-planner';

const agentId = AgentId.create();
const yes = { state: 'supported' } as const;
const no = { state: 'unsupported' } as const;
const info = { agentId, cli: 'codex', status: 'running', cliSessionId: 'session', task: 'work', workingDirectory: '.', startedAt: new Date().toISOString() } as AgentProcessInfo;
const caps: EffectiveLaneCapabilities = {
  agentId, resolvedAt: 1, source: 'live-handle', mcp: yes,
  messaging: { steer: yes, interrupt: yes, continuation: yes, resume: yes },
};

describe('planAgentDelivery', () => {
  it('refuses a starting lane until it has a handle', () => {
    const preview = planAgentDelivery({
      agentId,
      info: { ...info, status: 'starting' },
      delivery: 'queue',
      effectiveCapabilities: caps,
      hasLiveHandle: false,
    });
    expect(preview).toMatchObject({ mode: 'unsupported', supported: false });
    expect(preview.reason).toMatch(/lane is starting/i);
  });
  it('queues a running turn without interrupting', () => {
    expect(planAgentDelivery({ agentId, info, delivery: 'queue', effectiveCapabilities: caps, hasLiveHandle: true }).mode)
      .toBe('queue-next-turn');
  });

  it('selects live steer regardless of CLI name', () => {
    const pi = { ...info, cli: 'pi' } as AgentProcessInfo;
    expect(planAgentDelivery({ agentId, info: pi, delivery: 'now', effectiveCapabilities: caps, hasLiveHandle: true }).mode)
      .toBe('steer');
  });

  it('discloses partial turn loss for interrupt fallback', () => {
    const preview = planAgentDelivery({ agentId, info, delivery: 'now', effectiveCapabilities: { ...caps, messaging: { ...caps.messaging, steer: no } }, hasLiveHandle: true });
    expect(preview.mode).toBe('interrupt-resume');
    expect(preview.lossDisclosure?.confirmationRequired).toBe(true);
  });

  it('resumes an idle released session for queue', () => {
    const preview = planAgentDelivery({ agentId, info: { ...info, status: 'completed' }, delivery: 'queue', effectiveCapabilities: caps, hasLiveHandle: false });
    expect(preview).toMatchObject({ mode: 'start-turn', usesResume: true });
  });

  it('releases an idle live handle without continuation before cold resume', () => {
    const preview = planAgentDelivery({ agentId, info: { ...info, status: 'completed' },
      delivery: 'queue', hasLiveHandle: true,
      effectiveCapabilities: { ...caps, messaging: { ...caps.messaging, continuation: no } },
    });
    expect(preview).toMatchObject({ mode: 'start-turn', usesResume: true, supported: true });
  });

  it('refuses a missing agent record with the stable not_found reason', () => {
    const preview = planAgentDelivery({ agentId, delivery: 'queue', effectiveCapabilities: caps, hasLiveHandle: false });
    expect(preview).toMatchObject({ mode: 'unsupported', supported: false, reason: 'not_found' });
  });

  describe('turnInputRefusal', () => {
    const turnInput: NonNullable<EffectiveLaneCapabilities['turnInput']> = {
      model: yes, effort: { state: 'unsupported', reason: 'Codex effort is fixed.' },
      images: { state: 'supported', onSteer: false }, files: { state: 'unsupported', reason: 'No files.' },
      commands: { state: 'supported', blocked: ['always-approve'] }, skills: no,
    };
    const withInput: EffectiveLaneCapabilities = { ...caps, turnInput };
    const plan = (mode: 'steer' | 'queue', resume = false) => ({
      ...planAgentDelivery({ agentId, info, delivery: mode === 'steer' ? 'now' : 'queue', effectiveCapabilities: withInput, hasLiveHandle: true }),
      usesResume: resume,
    });
    const image = { data: 'aGk=', mediaType: 'image/png' } as const;

    it('passes text-only and unchanged settings', () => {
      expect(turnInputRefusal(plan('queue'), 'hello', undefined)).toBeUndefined();
      expect(turnInputRefusal(plan('steer'), 'hello', { model: 'm1' }, { model: 'm1' })).toBeUndefined();
    });

    it('refuses a blocked /command on live and cold plans', () => {
      for (const candidate of [plan('queue'), plan('queue', true)]) {
        expect(turnInputRefusal(candidate, '  /Always-Approve on', undefined)).toEqual({
          code: 'turn-input-unsupported',
          reason: 'Ptah does not allow /always-approve in a lane: its approval mode is set at spawn.',
        });
      }
    });

    it('refuses images on a resume plan and on a steer without onSteer', () => {
      expect(turnInputRefusal(plan('queue', true), 'x', { images: [image] })?.reason).toBe('Images need a running lane.');
      expect(turnInputRefusal(plan('steer'), 'x', { images: [image] })?.code).toBe('turn-input-unsupported');
      expect(turnInputRefusal(plan('queue'), 'x', { images: [image] })).toBeUndefined();
    });

    it('uses the item reason for unsupported files and effort', () => {
      expect(turnInputRefusal(plan('queue'), 'x', { files: ['a.ts'] })).toEqual({ code: 'turn-input-unsupported', reason: 'No files.' });
      expect(turnInputRefusal(plan('queue'), 'x', { reasoningEffort: 'high' })?.reason).toBe('Codex effort is fixed.');
    });

    it('refuses a model change on a steer plan as turn-options-refused', () => {
      expect(turnInputRefusal(plan('steer'), 'x', { model: 'm2' }, { model: 'm1' })).toEqual({
        code: 'turn-options-refused', reason: 'A model change applies from the next turn; use Send to queue it.',
      });
      expect(turnInputRefusal(plan('queue'), 'x', { model: 'm2' })).toBeUndefined();
    });

    it('refuses turn input when the plan has no resolved turn input', () => {
      const bare = planAgentDelivery({ agentId, info, delivery: 'queue', effectiveCapabilities: caps, hasLiveHandle: true });
      expect(turnInputRefusal(bare, 'x', { model: 'm2' })?.reason).toBe(TURN_INPUT_NOT_REPORTED);
      expect(turnInputRefusal(bare, 'x', {})).toBeUndefined();
    });
  });
});
