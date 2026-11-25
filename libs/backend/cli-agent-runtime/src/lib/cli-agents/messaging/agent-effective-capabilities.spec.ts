import { AgentId, type AgentProcessInfo, type CliAdapterManifest } from '@ptah-extension/shared';
import type { SdkHandle } from '../cli-adapters/cli-adapter.interface';
import { LANE_OPTIONS_UNREADABLE, resolveEffectiveLaneCapabilities } from './agent-effective-capabilities';
import { laneTurnInputContractViolations } from '../testing/lane-turn-input-contract';

const supported = { state: 'supported' } as const;
const unsupported = { state: 'unsupported' } as const;
const potential: CliAdapterManifest = {
  messaging: { steer: unsupported, interrupt: supported, continuation: supported, resume: supported },
  roleChannel: 'task-prompt', permissionModes: {},
  networkModes: { allow: supported, deny: unsupported },
  limitReader: { state: 'no-reliable-source' }, mcp: supported,
};

const info: AgentProcessInfo = {
  agentId: AgentId.create(), cli: 'pi', task: 'test', workingDirectory: '.',
  status: 'running', startedAt: new Date(0).toISOString(), cliSessionId: 'session',
};

describe('resolveEffectiveLaneCapabilities', () => {
  it('uses live handle probes, including Pi steer, instead of CLI names or potential steer', () => {
    const handle: SdkHandle = {
      abort: new AbortController(), done: Promise.resolve(0), onOutput: jest.fn(),
      steer: jest.fn(), interrupt: jest.fn(), continue: jest.fn(),
      supportsInterrupt: () => true, supportsContinuation: () => true,
    };
    const effective = resolveEffectiveLaneCapabilities(info, potential, handle, false, 123);
    expect(effective).toMatchObject({ source: 'live-handle', resolvedAt: 123,
      messaging: { steer: supported, interrupt: supported, continuation: supported } });
  });

  it('disables live operations after release while retaining session resume capability', () => {
    const effective = resolveEffectiveLaneCapabilities(info, potential, undefined, true, 456);
    expect(effective).toMatchObject({ source: 'restored-record', resolvedAt: 456,
      messaging: { steer: { state: 'unsupported' }, interrupt: { state: 'unsupported' },
        continuation: { state: 'unsupported' }, resume: supported } });
    expect(resolveEffectiveLaneCapabilities({ ...info, cliSessionId: undefined }, potential)
      .messaging.resume.state).toBe('unsupported');
  });

  describe('turn input', () => {
    const turnPotential: CliAdapterManifest = {
      ...potential,
      turnInput: {
        model: { state: 'supported', appliesAt: 'next-turn' },
        effort: { state: 'supported', appliesAt: 'next-turn' },
        images: { state: 'supported' },
        files: { state: 'supported', delivery: 'reference' },
        commands: { state: 'supported', blocked: ['always-approve'] },
        skills: { state: 'supported' },
      },
      usage: { timing: 'turn-end', reason: 'Grok reports token usage when the turn ends.' },
      prompts: { approvals: unsupported, questions: unsupported },
    };
    const grok: AgentProcessInfo = { ...info, cli: 'grok', displayName: 'Grok' };
    const baseHandle = (): SdkHandle => ({
      abort: new AbortController(), done: Promise.resolve(0), onOutput: jest.fn(),
      continue: jest.fn(), supportsContinuation: () => true,
    });

    it('supports an item only when the manifest claims it and the handle exposes the operation', () => {
      const handle: SdkHandle = { ...baseHandle(), applyTurnSettings: jest.fn(), listTurnOptions: jest.fn(),
        turnInputSupport: () => ({ images: { state: 'supported' } }) };
      expect(laneTurnInputContractViolations(handle, turnPotential)).toEqual([]);
      const effective = resolveEffectiveLaneCapabilities(grok, turnPotential, handle);
      expect(effective.turnInput).toMatchObject({
        model: { state: 'supported', appliesAt: 'next-turn' }, effort: { state: 'supported' },
        images: { state: 'supported' }, files: { state: 'supported', delivery: 'reference' },
        commands: { state: 'supported', blocked: ['always-approve'] }, skills: { state: 'supported' },
      });
      expect(effective.usage).toEqual(turnPotential.usage);
      expect(effective.prompts).toEqual(turnPotential.prompts);
    });

    it('refuses model/effort without applyTurnSettings and images without a live image gate', () => {
      const handle = baseHandle();
      expect(laneTurnInputContractViolations(handle, turnPotential)).toEqual(expect.arrayContaining([
        expect.stringContaining('turnInput.model'), expect.stringContaining('turnInput.images'),
      ]));
      const turnInput = resolveEffectiveLaneCapabilities(grok, turnPotential, handle).turnInput;
      expect(turnInput?.model.state).toBe('unsupported');
      expect(turnInput?.effort.state).toBe('unsupported');
      expect(turnInput?.images.state).toBe('unsupported');
    });

    it('lets a live gate narrow an item and merges live blocked names', () => {
      const handle: SdkHandle = { ...baseHandle(), applyTurnSettings: jest.fn(),
        turnInputSupport: () => ({
          images: { state: 'unsupported', reason: 'The agent did not advertise image input.' },
          skills: { state: 'unsupported', reason: 'Grok advertises no skills to lanes.' },
          commands: { state: 'supported', blocked: ['yolo'] },
        }) };
      const turnInput = resolveEffectiveLaneCapabilities(grok, turnPotential, handle).turnInput;
      expect(turnInput?.images).toEqual({ state: 'unsupported', reason: 'The agent did not advertise image input.' });
      expect(turnInput?.skills).toEqual({ state: 'unsupported', reason: 'Grok advertises no skills to lanes.' });
      expect(turnInput?.commands.blocked).toEqual(['always-approve', 'yolo']);
    });

    it('treats a throwing turnInputSupport as all unsupported, keeping blocked', () => {
      const handle: SdkHandle = { ...baseHandle(), applyTurnSettings: jest.fn(),
        turnInputSupport: () => { throw new Error('boom'); } };
      const turnInput = resolveEffectiveLaneCapabilities(grok, turnPotential, handle).turnInput;
      expect(turnInput?.model).toEqual({ state: 'unsupported', reason: LANE_OPTIONS_UNREADABLE });
      expect(turnInput?.images.reason).toBe(LANE_OPTIONS_UNREADABLE);
      expect(turnInput?.commands.blocked).toEqual(['always-approve']);
    });

    it('names the CLI when the manifest declares no turn input, usage or prompts', () => {
      const effective = resolveEffectiveLaneCapabilities(grok, potential, baseHandle());
      expect(effective.turnInput?.model).toEqual({ state: 'unsupported', reason: 'Grok does not declare per-turn model.' });
      expect(effective.turnInput?.effort.reason).toBe('Grok does not declare per-turn reasoning effort.');
      expect(effective.turnInput?.commands.blocked).toEqual([]);
      expect(effective.usage?.reason).toMatch(/Grok does not declare/);
      expect(effective.prompts?.approvals.state).toBe('unsupported');
    });

    it('keeps blocked commands on a restored (stopped) Grok record with no handle', () => {
      const effective = resolveEffectiveLaneCapabilities({ ...grok, status: 'stopped' }, turnPotential);
      expect(effective.source).toBe('restored-record');
      expect(effective.turnInput).toMatchObject({
        model: { state: 'supported' }, effort: { state: 'supported' }, files: { state: 'supported' },
        images: { state: 'unsupported', reason: 'Images need a running lane.' },
        commands: { state: 'supported', blocked: ['always-approve'] }, skills: { state: 'supported' },
      });
    });

    it('keeps images on a stopped lane whose cold resume carries them (L3)', () => {
      const resumable: CliAdapterManifest = { ...turnPotential, turnInput: { ...(turnPotential.turnInput as NonNullable<CliAdapterManifest['turnInput']>),
        images: { state: 'supported', onSteer: false, onResume: true } } };
      const stopped = { ...grok, cli: 'claude' as const, displayName: 'Claude', status: 'stopped' as const };
      expect(resolveEffectiveLaneCapabilities(stopped, resumable).turnInput?.images)
        .toEqual({ state: 'supported', onSteer: false, onResume: true });
      // Without the flag the stopped lane still refuses.
      expect(resolveEffectiveLaneCapabilities(stopped, turnPotential).turnInput?.images)
        .toEqual({ state: 'unsupported', reason: 'Images need a running lane.' });
    });

    it('refuses images on a stopped named-account lane even with onResume', () => {
      const resumable: CliAdapterManifest = { ...turnPotential, turnInput: { ...(turnPotential.turnInput as NonNullable<CliAdapterManifest['turnInput']>),
        images: { state: 'supported', onResume: true } } };
      const named = { ...grok, status: 'stopped' as const, accountBindingId: 'run-1' } as AgentProcessInfo;
      expect(resolveEffectiveLaneCapabilities(named, resumable).turnInput?.images)
        .toEqual({ state: 'unsupported', onResume: true, reason: 'Images need a running lane on a named-account Claude lane.' });
    });

    it('hides steer when supportsSteer reports false', () => {
      const handle: SdkHandle = { ...baseHandle(), steer: jest.fn(), supportsSteer: () => false };
      expect(resolveEffectiveLaneCapabilities(grok, turnPotential, handle).messaging.steer.state).toBe('unsupported');
      expect(resolveEffectiveLaneCapabilities(grok, turnPotential, { ...handle, supportsSteer: () => true })
        .messaging.steer.state).toBe('supported');
    });

    it('reports the spawn approval mode and whether prompts can appear', () => {
      const effective = resolveEffectiveLaneCapabilities(
        { ...grok, effectivePolicy: { permission: 'yolo', permissionSource: 'spawn' } },
        { ...turnPotential, permissionModes: { yolo: { state: 'supported', nativeMode: 'always-approve', networkModes: ['allow'] } } },
        baseHandle(),
      );
      expect(effective.effectiveApproval).toEqual({
        mode: 'yolo',
        reason: 'Set when the lane was spawned. Native mode: always-approve. Approval prompts do not reach Ptah from this lane.',
      });
      expect(resolveEffectiveLaneCapabilities(grok, turnPotential).effectiveApproval?.mode).toBe('unknown');
    });
  });
});
