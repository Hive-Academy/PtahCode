import {
  classifyContinuationFailure,
  classifyContinuationFailureDetail,
} from './continuation-failure.classifier';

function continueError(code: string): Error {
  const error = new Error(`continue failed: ${code}`);
  error.name = 'AgentContinueError';
  return Object.assign(error, { code });
}

describe('classifyContinuationFailure', () => {
  it('classifies a busy lane as transient', () => {
    expect(classifyContinuationFailure(continueError('busy'))).toBe('continuation_transient');
  });

  it.each(['not_found', 'invalid_params', 'unsupported', 'released', 'account_refused', 'turn-options-refused', 'unknown'])(
    'classifies the %s continue code as permanent',
    (code) => {
      expect(classifyContinuationFailure(continueError(code))).toBe('continuation_rejected');
    },
  );

  it('treats unrecognised errors and codes as permanent', () => {
    expect(classifyContinuationFailure(new Error('busy'))).toBe('continuation_rejected');
    expect(classifyContinuationFailure(continueError('timeout'))).toBe('continuation_rejected');
    expect(classifyContinuationFailure('busy')).toBe('continuation_rejected');
    expect(classifyContinuationFailure(undefined)).toBe('continuation_rejected');
  });
});

describe('classifyContinuationFailureDetail', () => {
  it('keeps a settings refusal terminal with its text as lastError (≤ 200 chars)', () => {
    const error = Object.assign(new Error(`Codex did not accept the model ${'x'.repeat(300)}`), {
      code: 'turn-options-refused',
    });
    error.name = 'AgentContinueError';
    const detail = classifyContinuationFailureDetail(error);
    expect(detail).toMatchObject({ reason: 'continuation_rejected', reasonCode: 'turn-options-refused' });
    expect(detail.lastError).toHaveLength(200);
    expect(detail.lastError?.startsWith('Codex did not accept the model')).toBe(true);
  });

  it('keeps a blocked or content refusal as turn-input-unsupported with its text', () => {
    const error = Object.assign(continueError('unsupported'), { receiptReason: 'turn-input-unsupported' });
    error.message = 'Ptah does not allow /always-approve in a lane: its approval mode is set at spawn.';
    expect(classifyContinuationFailureDetail(error)).toEqual({
      reason: 'continuation_rejected',
      reasonCode: 'turn-input-unsupported',
      lastError: 'Ptah does not allow /always-approve in a lane: its approval mode is set at spawn.',
    });
  });

  it('adds nothing for other failures', () => {
    expect(classifyContinuationFailureDetail(continueError('busy'))).toEqual({ reason: 'continuation_transient' });
    expect(classifyContinuationFailureDetail(continueError('unsupported'))).toEqual({ reason: 'continuation_rejected' });
    expect(classifyContinuationFailureDetail(undefined)).toEqual({ reason: 'continuation_rejected' });
  });
});
