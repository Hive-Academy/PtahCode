import { messageOutcomeText } from './agent-message-outcome-text';

const FALLBACK = 'Could not send your message. Try again.';

describe('messageOutcomeText', () => {
  it('maps a bare code in detail to user text (S1)', () => {
    expect(messageOutcomeText({ reasonCode: 'attachments-capacity', detail: 'attachments-capacity' }, FALLBACK))
      .toBe('Held attachments are using all attachment storage. Remove an image or wait for earlier messages to finish.');
    expect(messageOutcomeText({ reasonCode: 'storage-unavailable', detail: 'storage-unavailable' }, FALLBACK))
      .toBe('Message storage is unavailable. Try again.');
  });

  it('keeps host text in detail as it is', () => {
    expect(messageOutcomeText({
      reasonCode: 'turn-input-unsupported', detail: 'Grok did not advertise image input.',
    }, FALLBACK)).toBe('Grok did not advertise image input.');
  });

  it('maps the reason code when detail is absent', () => {
    expect(messageOutcomeText({ reasonCode: 'rate-limited' }, FALLBACK))
      .toBe('Too many messages in a short time. Wait a moment.');
  });

  it('falls back for an unknown code or an empty outcome, never showing the code', () => {
    expect(messageOutcomeText({ detail: 'already-decided' }, FALLBACK)).toBe(FALLBACK);
    expect(messageOutcomeText({}, FALLBACK)).toBe(FALLBACK);
  });
});
