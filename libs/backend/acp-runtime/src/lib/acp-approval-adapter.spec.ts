import type { RequestPermissionRequest } from '@agentclientprotocol/sdk';
import type {
  ProviderApprovalDecision,
  ProviderApprovalSink,
} from '@ptah-extension/provider-session-contracts';
import {
  acpResponseForDecision,
  requestAcpApproval,
  toProviderApprovalRequest,
} from './acp-approval-adapter';

const request = {
  sessionId: 's',
  toolCall: {
    toolCallId: 'call-1',
    kind: 'edit',
    title: 'Write a.txt',
    rawInput: { path: 'a.txt' },
  },
  options: [
    { optionId: 'yes-once', name: 'Yes', kind: 'allow_once' },
    { optionId: 'no-once', name: 'No', kind: 'reject_once' },
    { optionId: 'no-ever', name: 'Never', kind: 'reject_always' },
  ],
} as unknown as RequestPermissionRequest;

describe('acp approval adapter', () => {
  it('builds the neutral request from the tool call', () => {
    expect(toProviderApprovalRequest(request, 'r-1')).toEqual({
      requestId: 'r-1',
      toolCallId: 'call-1',
      title: 'Write a.txt',
      kind: 'edit',
      input: { path: 'a.txt' },
    });
    expect(toProviderApprovalRequest({} as RequestPermissionRequest, 'r-2')).toEqual({
      requestId: 'r-2',
      title: 'a tool call',
    });
  });

  it('chooses options by kind and falls back to allow_once for acceptForSession (A17)', () => {
    const selected = (decision: ProviderApprovalDecision) =>
      acpResponseForDecision(request, decision);
    expect(selected('accept')).toEqual({
      response: { outcome: { outcome: 'selected', optionId: 'yes-once' } },
      refused: false,
    });
    expect(selected('acceptForSession').response).toEqual({
      outcome: { outcome: 'selected', optionId: 'yes-once' },
    });
    expect(selected('decline')).toEqual({
      response: { outcome: { outcome: 'selected', optionId: 'no-once' } },
      refused: true,
    });
    expect(selected('cancel')).toEqual({
      response: { outcome: { outcome: 'cancelled' } },
      refused: true,
    });
  });

  it('never allows when nothing matches, the sink fails or the signal aborts', async () => {
    const bare = { ...request, options: [] } as unknown as RequestPermissionRequest;
    expect(acpResponseForDecision(bare, 'accept').response).toEqual({
      outcome: { outcome: 'cancelled' },
    });

    const approval = toProviderApprovalRequest(request, 'r');
    const failing: ProviderApprovalSink = {
      request: () => Promise.reject(new Error('x')),
    };
    await expect(
      requestAcpApproval(failing, request, approval, new AbortController().signal),
    ).resolves.toMatchObject({ decision: 'cancel', refused: true });

    const pending: ProviderApprovalSink = {
      request: () => new Promise<ProviderApprovalDecision>(() => undefined),
    };
    const controller = new AbortController();
    const asked = requestAcpApproval(pending, request, approval, controller.signal);
    controller.abort();
    await expect(asked).resolves.toMatchObject({ decision: 'cancel' });

    const aborted = new AbortController();
    aborted.abort();
    const sink = { request: jest.fn() };
    await expect(
      requestAcpApproval(sink, request, approval, aborted.signal),
    ).resolves.toMatchObject({ decision: 'cancel' });
    expect(sink.request).not.toHaveBeenCalled();
  });

  it('never maps acceptForSession to allow_always, even when only allow_always is offered', () => {
    const alwaysOnly = {
      ...request,
      options: [{ optionId: 'yes-always', name: 'Always', kind: 'allow_always' }],
    } as unknown as RequestPermissionRequest;
    expect(acpResponseForDecision(alwaysOnly, 'acceptForSession')).toEqual({
      response: { outcome: { outcome: 'cancelled' } },
      refused: true,
    });
  });

  it('answers cancel when the sink aborts synchronously and returns a settled accept', async () => {
    const approval = toProviderApprovalRequest(request, 'r');
    const controller = new AbortController();
    const racing: ProviderApprovalSink = {
      request: () => {
        controller.abort();
        return Promise.resolve('accept');
      },
    };
    await expect(
      requestAcpApproval(racing, request, approval, controller.signal),
    ).resolves.toEqual({
      decision: 'cancel',
      response: { outcome: { outcome: 'cancelled' } },
      refused: true,
    });
  });

  it('treats a prototype-member answer as cancel and never throws', async () => {
    const approval = toProviderApprovalRequest(request, 'r');
    const odd = { request: async () => 'toString' as ProviderApprovalDecision };
    await expect(
      requestAcpApproval(odd, request, approval, new AbortController().signal),
    ).resolves.toMatchObject({ decision: 'cancel', refused: true });
    expect(acpResponseForDecision(request, 'constructor' as ProviderApprovalDecision)).toEqual({
      response: { outcome: { outcome: 'cancelled' } },
      refused: true,
    });
  });
});
