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
  const repositoryRoot = signal<string | null>('D:/work/repository');
  const call = jest.fn();
  let store: ReviewFindingsStore;
  beforeEach(() => {
    selectedAttemptId.set('attempt-1'); repositoryRoot.set('D:/work/repository'); call.mockReset();
    TestBed.configureTestingModule({ providers: [ReviewFindingsStore,
      { provide: ReviewRunsStore, useValue: { selectedAttemptId, repositoryRoot } },
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
  it('opens evidence against the root of the reviewed repository', async () => {
    call.mockResolvedValue({ isSuccess: () => true, data: { success: true } });
    await store.openEvidence('src/a.ts', 3);
    expect(call).toHaveBeenCalledWith('file:open', { path: 'src/a.ts', workspaceRoot: 'D:/work/repository', line: 3 }, { timeout: 30_000 });
    expect(store.openError()).toBeNull();
  });
  it.each(['../outside.ts', 'src/../../outside.ts', 'src\\..\\..\\outside.ts', '/etc/passwd', 'C:/Windows/win.ini', '\\\\host\\share\\a.ts', ''])(
    'rejects the evidence path %p without a host call', async (path) => {
      await store.openEvidence(path, 1);
      expect(call).not.toHaveBeenCalled();
      expect(store.openError()).toBe('Could not open the file. Its path is not inside the reviewed repository.');
    });
  it('does not call the host when the reviewed repository is not open', async () => {
    repositoryRoot.set(null);
    await store.openEvidence('src/a.ts', 3);
    expect(call).not.toHaveBeenCalled();
    expect(store.openError()).toBe('The reviewed repository is not open in Ptah. Add its folder as a workspace.');
  });
  it('shows an error when the host refuses the file', async () => {
    call.mockResolvedValue({ isSuccess: () => true, data: { success: false, error: 'outside' } });
    await store.openEvidence('src/a.ts', 3);
    expect(store.openError()).toBe('Could not open the file from the reviewed repository.');
  });
  it.each([
    ['a late refusal', (finish: (result: object) => void) => finish({ isSuccess: () => true, data: { success: false } })],
    ['a late RPC failure', (finish: (result: object) => void) => finish({ isSuccess: () => false })],
  ])('does not show %s of an earlier run', async (_name, settle) => {
    let finish: ((result: object) => void) | undefined;
    call.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = store.openEvidence('src/a.ts', 3);
    selectedAttemptId.set('attempt-2'); TestBed.tick();
    if (finish) settle(finish);
    await pending;
    expect(store.openError()).toBeNull();
  });
  it('does not show a late clipboard result of an earlier run', async () => {
    let finish: (() => void) | undefined;
    const writeText = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const pending = store.sendToLane(view);
    selectedAttemptId.set('attempt-2'); TestBed.tick();
    finish?.();
    await pending;
    expect(store.copied()).toBe(false);
    writeText.mockRejectedValueOnce(new Error('denied'));
    const failed = store.sendToLane(view);
    selectedAttemptId.set('attempt-3'); TestBed.tick();
    await failed;
    expect(store.copyError()).toBeNull();
  });
});
