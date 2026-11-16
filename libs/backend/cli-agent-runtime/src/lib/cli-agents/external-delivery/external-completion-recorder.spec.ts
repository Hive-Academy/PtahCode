import type { AgentProcessInfo } from '@ptah-extension/shared';
import { Logger } from '@ptah-extension/vscode-core';
import { ExternalCompletionOutbox } from './external-completion-outbox';
import { ExternalCompletionRecorder } from './external-completion-recorder';
import { derivePrincipal } from './external-owner-key';
import type { LaneCompletionResult } from '../lane-completion-replay';

describe('ExternalCompletionRecorder', () => {
  const owner = { transport: 'http' as const, principal: derivePrincipal('slot:1'), exclusive: true };
  const info = { agentId: 'lane', completedAt: 'time' } as AgentProcessInfo;
  const result: LaneCompletionResult = { delivered: false, reason: 'no-parent-recorded', completion: { parentSignal: '<agent-lane-completed />', verdict: 'delivered', phaseKind: null, executorId: 'codex', deliverableCheck: [], toolProfileAdapter: null } };
  const logger = Object.assign(Object.create(Logger.prototype) as Logger, { error: jest.fn(), info: jest.fn(), warn: jest.fn() });

  it('records nothing for an owner key that fails the schema', () => {
    const box = new ExternalCompletionOutbox(logger);
    const recorder = new ExternalCompletionRecorder(logger, box);
    const forged = { ...owner, principal: '/home/<user>/token secret' };
    recorder.recordFromSignal(info, forged, result);
    expect(box.pendingCount(forged)).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), { agentId: 'lane' });
  });

  it('records no-parent completion and ignores absent owner or body', () => {
    const box = new ExternalCompletionOutbox(logger);
    const recorder = new ExternalCompletionRecorder(logger, box);
    recorder.recordFromSignal(info, owner, result);
    expect(box.findForLane(owner, 'lane')?.body).toBe('<agent-lane-completed />');
    recorder.recordFromSignal(info, undefined, result);
    recorder.recordFromSignal(info, owner, { delivered: false, reason: 'already-signalled' });
    expect(box.pendingCount(owner)).toBe(1);
  });

  it('logs a real Error and does not throw when recording fails', () => {
    const box = new ExternalCompletionOutbox(logger);
    jest.spyOn(box, 'record').mockImplementation(() => { throw new Error('failed'); });
    const recorder = new ExternalCompletionRecorder(logger, box);
    expect(() => recorder.recordFromSignal(info, owner, result)).not.toThrow();
    expect(logger.error).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
  });
});
