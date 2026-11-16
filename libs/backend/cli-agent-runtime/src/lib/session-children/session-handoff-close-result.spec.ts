import { handoffCloseAckResult } from './session-handoff-close-result';

describe('handoffCloseAckResult', () => {
  it('returns closed when the predecessor closes successfully', () => {
    const result = handoffCloseAckResult({ kind: 'closed' });
    expect(result).toEqual({
      status: 'closed',
      reason: 'predecessor closed',
    });
  });

  it('returns already-closed when the predecessor tab is not found', () => {
    const result = handoffCloseAckResult({ kind: 'absent' });
    expect(result.status).toBe('already-closed');
    expect(result.reason).toContain('not found');
  });

  it('returns retryable-failure on timeout', () => {
    const result = handoffCloseAckResult({ kind: 'timeout' });
    expect(result.status).toBe('retryable-failure');
    expect(result.reason).toContain('timeout');
  });

  it('returns retryable-failure when broadcast fails', () => {
    const result = handoffCloseAckResult({ kind: 'broadcast-failed' });
    expect(result.status).toBe('retryable-failure');
    expect(result.reason).toContain('broadcast');
  });

  it('returns refused for terminal blocker codes', () => {
    const terminalBlockers: Array<any> = [
      { kind: 'blocked' as const, code: 'unsent-input' },
      { kind: 'blocked' as const, code: 'queued-message' },
      { kind: 'blocked' as const, code: 'permission-prompt' },
      { kind: 'blocked' as const, code: 'command-center' },
      { kind: 'blocked' as const, code: 'sdk-mismatch' },
      { kind: 'blocked' as const, code: 'close-rejected' },
      { kind: 'blocked' as const, code: 'invalid-request' },
      { kind: 'blocked' as const, code: 'unknown' },
    ];

    for (const blocker of terminalBlockers) {
      const result = handoffCloseAckResult(blocker);
      expect(result.status).toBe('refused');
    }
  });

  it('returns retryable-failure for non-terminal blocker codes', () => {
    const nonTerminalBlockers: Array<any> = [
      { kind: 'blocked' as const, code: 'streaming' },
      { kind: 'blocked' as const, code: 'resuming' },
      { kind: 'blocked' as const, code: 'switching' },
      { kind: 'blocked' as const, code: 'background' },
      { kind: 'blocked' as const, code: 'sleeping' },
      { kind: 'blocked' as const, code: 'other-status' },
      { kind: 'blocked' as const, code: 'pending-background-tasks' },
      { kind: 'blocked' as const, code: 'close-error' },
    ];

    for (const blocker of nonTerminalBlockers) {
      const result = handoffCloseAckResult(blocker);
      expect(result.status).toBe('retryable-failure');
    }
  });
});
