import { antigravityAcpProfile } from '@ptah-extension/acp-runtime';
import { antigravityAcpManifest } from './antigravity-acp-lane';

describe('antigravityAcpManifest lane turn input (B8)', () => {
  const manifest = antigravityAcpManifest('task-prompt');

  it('declares next-turn model and effort, advertised images, file references and commands', () => {
    expect(manifest.turnInput).toEqual({
      model: { state: 'supported', appliesAt: 'next-turn' },
      effort: { state: 'supported', appliesAt: 'next-turn' },
      images: { state: 'supported', onSteer: false },
      files: { state: 'supported', delivery: 'reference' },
      // The agy profile hides no permission-policy command (D18).
      commands: { state: 'supported', blocked: [] },
      // Narrowed live: agy advertises no SKILL.md entries, so a live lane reports none.
      skills: { state: 'supported' },
    });
    expect(antigravityAcpProfile.hiddenLaneCommands).toBeUndefined();
  });

  it('reports usage at turn end and keeps lane prompts unsupported with the manifest reason', () => {
    expect(manifest.usage).toEqual({
      timing: 'turn-end',
      reason: `${antigravityAcpProfile.displayName} reports token usage when the turn ends.`,
    });
    const reason = 'A lane has no approval route; tool approvals are decided headlessly.';
    expect(manifest.prompts).toEqual({
      approvals: { state: 'unsupported', reason },
      questions: { state: 'unsupported', reason },
    });
    expect(manifest.permissionModes.ask?.reason).toBe(reason);
  });

  it('keeps the messaging section: interrupt and continuation, no steer', () => {
    expect(manifest.messaging.steer.state).toBe('unsupported');
    expect(manifest.messaging.interrupt.state).toBe('supported');
    expect(manifest.messaging.continuation.state).toBe('supported');
  });
});
