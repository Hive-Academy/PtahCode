import type { ModelListFailureReason } from '../types/rpc/rpc-providers.types';
import {
  CREDENTIAL_FAILURE_REASONS,
  describeModelListFailure,
  modelListErrorText,
  modelListNoticeText,
} from './model-list-failure';

const COPY: Record<ModelListFailureReason, string> = {
  'no-key': 'add your Z.AI API key in Settings',
  'not-signed-in': 'sign in to Z.AI in Settings',
  'auth-rejected':
    'Z.AI rejected the API key; delete it and enter a valid one in Settings',
  timeout: 'Z.AI did not answer in time',
  network: "couldn't reach Z.AI",
  'http-error': 'Z.AI returned an error',
  'bad-response': "Z.AI sent a model list Ptah can't read",
  empty: 'Z.AI returned no models',
  'no-live-source': 'Z.AI has no model list endpoint',
  unexpected: 'an unexpected error occurred (details in the log)',
};

describe('model list failure copy', () => {
  it.each(Object.entries(COPY) as Array<[ModelListFailureReason, string]>)(
    'describes %s with one fixed sentence',
    (reason, copy) => {
      expect(describeModelListFailure(reason, 'Z.AI')).toBe(copy);
      expect(modelListErrorText(reason, 'Z.AI')).toBe(
        `Couldn't load models from Z.AI: ${copy}.`,
      );
    },
  );

  it('marks exactly the three credential reasons', () => {
    expect([...CREDENTIAL_FAILURE_REASONS].sort()).toEqual([
      'auth-rejected',
      'no-key',
      'not-signed-in',
    ]);
  });

  it('dates the notice by the UTC calendar day of savedAt', () => {
    // 23:30 UTC on 2026-03-04 is already 2026-03-05 east of UTC.
    const savedAt = Date.UTC(2026, 2, 4, 23, 30);
    expect(modelListNoticeText('timeout', 'Kimi Code', savedAt)).toBe(
      "Couldn't load models from Kimi Code (Kimi Code did not answer in time). " +
        'Showing the list saved on 2026-03-04.',
    );
  });

  it('omits the date when savedAt is not a valid time', () => {
    expect(modelListNoticeText('network', 'Kimi Code', Number.NaN)).toBe(
      "Couldn't load models from Kimi Code (couldn't reach Kimi Code). Showing the saved list.",
    );
    expect(() =>
      modelListNoticeText('network', 'Kimi Code', Number.MAX_VALUE),
    ).not.toThrow();
  });
});
