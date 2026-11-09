import { callSessionHandoffAck, SessionHandoffAckArgsSchema } from './session-handoff-ack.tool';
import type { SessionNamespace } from '../namespace-builders/session-namespace.builder';

describe('ptah_session_handoff_ack', () => {
  const input = { predecessorSessionId: 'old', handoffPath: '/repo/HANDOFF.md' };
  it('validates arguments and returns the acknowledgement', async () => {
    const acknowledge = jest.fn().mockResolvedValue({ status: 'closed', reason: 'Closed.' });
    const session = { acknowledge } as Pick<SessionNamespace, 'acknowledge'> as SessionNamespace;
    expect(SessionHandoffAckArgsSchema.safeParse(input).success).toBe(true);
    expect(JSON.parse(await callSessionHandoffAck(input, session))).toEqual({ status: 'closed', reason: 'Closed.' });
    expect(acknowledge).toHaveBeenCalledWith(input);
  });
  it('returns a safe retryable failure when the namespace is unavailable', async () => {
    const session = { acknowledge: jest.fn().mockRejectedValue(new Error('secret')) } as Pick<SessionNamespace, 'acknowledge'> as SessionNamespace;
    expect(JSON.parse(await callSessionHandoffAck(input, session))).toEqual({ status: 'retryable-failure', reason: 'Acknowledgement is temporarily unavailable.' });
  });
});
