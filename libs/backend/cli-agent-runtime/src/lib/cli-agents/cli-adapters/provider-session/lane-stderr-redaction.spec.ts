import { classifyCliStderr } from '../cli-stderr-severity';
import { laneStderrLine, redactLaneStderr } from './lane-stderr-redaction';

describe('redactLaneStderr', () => {
  it('redacts the value of a quoted secret key', () => {
    const result = redactLaneStderr('payload {"api_key":"x-secret-value","model":"m"}');
    expect(result).toBe('payload {"api_key":"[REDACTED]","model":"m"}');
  });

  it('redacts a Bearer credential', () => {
    const result = redactLaneStderr('sending Bearer abc.def-123 now');
    expect(result).toBe('sending Bearer [REDACTED] now');
  });

  it('redacts an inline token= field', () => {
    expect(redactLaneStderr('url token=xyz789')).toBe('url token=[REDACTED]');
  });

  it('redacts an inline password: field', () => {
    expect(redactLaneStderr('login password: hunter2')).toBe(
      'login password: [REDACTED]',
    );
  });

  it('scrubs every occurrence of the lane MCP token', () => {
    const token = 'lane-tok-42';
    const result = redactLaneStderr(`first ${token} then ${token}`, token);
    expect(result).toBe('first [REDACTED] then [REDACTED]');
    expect(result).not.toContain(token);
  });

  it.each([undefined, ''])(
    'treats a %p token as a no-op and inserts no marker',
    (token) => {
      expect(redactLaneStderr('plain line', token)).toBe('plain line');
    },
  );

  it('returns a line with no secret unchanged', () => {
    const line = 'warming up the model cache (3/5)';
    expect(redactLaneStderr(line, 'unrelated-token')).toBe(line);
  });

  it.each([
    'HTTP 401 Unauthorized',
    'RESOURCE_EXHAUSTED: quota exceeded',
    '429 Too Many Requests',
  ])('keeps %p and its stderr severity intact', (raw) => {
    const redacted = redactLaneStderr(raw);
    expect(redacted).toBe(raw);
    expect(classifyCliStderr(redacted)).toBe(classifyCliStderr(raw));
  });

  describe('a secret field and a status on one line', () => {
    const raw = 'request authorization: Bearer abc.def 401 Unauthorized';

    it('masks the rest of the line, status words included', () => {
      // The field rule runs to the end of the line, so the redacted text alone
      // reads as `info`; the lane must not classify on it.
      const redacted = redactLaneStderr(raw);
      expect(redacted).toBe('request authorization: [REDACTED]');
      expect(classifyCliStderr(redacted)).toBe('info');
    });

    it('keeps the error severity of the original line and emits only redacted text', () => {
      expect(laneStderrLine(raw, 'lane-tok')).toEqual({
        severity: 'error',
        text: 'request authorization: [REDACTED]',
      });
    });

    it('classifies a line with no status word as info', () => {
      expect(laneStderrLine('token=abc123').severity).toBe('info');
    });
  });
});
