import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ClaudeRpcService } from '@ptah-extension/core';
import { ReviewRunsStore } from '../review-runs.store';
import { ReviewFindingsStore } from './review-findings.store';
import { toFindingViews } from './review-finding-view';
import type { ReviewFinding } from '@ptah-extension/review-contracts';

const view = toFindingViews([{
  schemaVersion: 1, lens: 'correctness-lifecycle', title: 'Broken call', failureMode: 'Failure', affectedBehavior: 'Behavior',
  scenario: 'Scenario', path: 'src/a.ts', line: 3, evidence: [{ path: 'src/a.ts', line: 3, excerpt: 'evidence' }],
  affectedCaller: null, severity: 'Critical', category: 'functional', confidence: 0.9, verification: 'cross-family',
  suggestedDiff: null, fixPrompt: 'Fix it',
} satisfies ReviewFinding])[0];

describe('ReviewFindingsStore', () => {
  const selectedAttemptId = signal<string | null>('attempt-1');
  const call = jest.fn();
  let store: ReviewFindingsStore;
  beforeEach(() => {
    selectedAttemptId.set('attempt-1'); call.mockReset();
    TestBed.configureTestingModule({ providers: [ReviewFindingsStore,
      { provide: ReviewRunsStore, useValue: { selectedAttemptId } },
      { provide: ClaudeRpcService, useValue: { call } },
    ] });
    store = TestBed.inject(ReviewFindingsStore);
    TestBed.tick();
  });
  it('sends the title and applies successful triage', async () => {
    call.mockResolvedValue({ isSuccess: () => true, data: { ok: true } });
    await store.respond(view, 'accept');
    expect(call).toHaveBeenCalledWith('review:respondToFinding', expect.objectContaining({ title: 'Broken call', action: 'accept' }), { timeout: 30_000 });
    expect(store.triage()[view.key].state).toBe('accepted');
  });
  it('blocks a second post while pending', async () => {
    let finish: ((result: object) => void) | undefined;
    call.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const first = store.respond(view, 'reply', ' Hello ');
    await store.respond(view, 'reply', 'Again');
    expect(call).toHaveBeenCalledTimes(1);
    finish?.({ isSuccess: () => true, data: { ok: true } });
    await first;
    expect(store.triage()[view.key].replied).toBe(true);
  });
  it('does not apply late results to another attempt', async () => {
    let finish: ((result: object) => void) | undefined;
    call.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = store.respond(view, 'dismiss');
    selectedAttemptId.set('attempt-2'); TestBed.tick();
    finish?.({ isSuccess: () => true, data: { ok: true } });
    await pending;
    expect(store.triage()[view.key]).toBeUndefined();
  });
  it('ignores a declined file open', async () => {
    call.mockResolvedValue({ isSuccess: () => true, data: { success: false, cancelled: true } });
    await store.openEvidence('src/a.ts', 3);
    expect(store.openError()).toBeNull();
  });
});
