import { endCauseForAbortSource } from './abort-end-cause';

describe('endCauseForAbortSource', () => {
  it.each([
    ['stop-button', 'user-stop'],
    ['apps-stop', 'user-stop'],
    ['tab-close', 'tab-close'],
    ['workspace-remove', 'workspace-close'],
    ['tab-reset', 'internal-abort'],
    ['carry-over', 'internal-abort'],
    ['apps-reset', 'internal-abort'],
    ['command-center', 'user-stop'],
    ['worker', 'internal-abort'],
  ] as const)('maps %s to %s', (source, cause) => {
    expect(endCauseForAbortSource(source)).toBe(cause);
  });
  it('maps an unspecified source to internal-abort', () => {
    expect(endCauseForAbortSource()).toBe('internal-abort');
  });
});
