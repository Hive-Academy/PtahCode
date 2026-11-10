import { Injectable, effect, inject, signal } from '@angular/core';
import { ClaudeRpcService } from '@ptah-extension/core';
import { ReviewRpcSchemas } from '@ptah-extension/review-contracts';
import type { FileOpenParams, FileOpenResult } from '@ptah-extension/shared';
import { ReviewRunsStore } from '../review-runs.store';
import { isRepositoryRelativePath, openTriage, type FindingTriage, type ReviewFindingView, type TriageMap } from './review-finding-view';

@Injectable({ providedIn: 'root' })
export class ReviewFindingsStore {
  private readonly rpc = inject(ClaudeRpcService);
  private readonly runs = inject(ReviewRunsStore);
  readonly triage = signal<TriageMap>({});
  readonly openError = signal<string | null>(null);
  readonly copyError = signal<string | null>(null);
  readonly copied = signal(false);
  private attemptId: string | null = null;

  constructor() {
    effect(() => {
      const next = this.runs.selectedAttemptId();
      if (next !== this.attemptId) {
        this.attemptId = next;
        this.triage.set({});
        this.openError.set(null);
        this.copyError.set(null);
        this.copied.set(false);
      }
    });
  }

  private update(key: string, change: Partial<FindingTriage>): void {
    this.triage.update(map => ({ ...map, [key]: { ...(map[key] ?? openTriage), ...change } }));
  }

  async respond(view: ReviewFindingView, action: 'accept' | 'dismiss' | 'reply', body?: string): Promise<void> {
    const attemptId = this.runs.selectedAttemptId();
    const current = this.triage()[view.key] ?? openTriage;
    if (!attemptId || current.pending) return;
    // An accept or dismiss reply is permanent on GitHub: post it only one time for each finding.
    if (action !== 'reply' && current.state !== 'open') return;
    const trimmed = body?.trim();
    if (action === 'reply' && !trimmed) return;
    this.update(view.key, { pending: true, error: null, ...(action === 'reply' ? { replied: false } : {}) });
    try {
      const params = ReviewRpcSchemas['review:respondToFinding'].params.parse({
        attemptId, path: view.path, line: view.line, title: view.title, action, body: trimmed || undefined,
      });
      const response = await this.rpc.call('review:respondToFinding', params, { timeout: 30_000 });
      if (this.runs.selectedAttemptId() !== attemptId) return;
      if (!response.isSuccess()) throw new Error('rpc');
      const result = ReviewRpcSchemas['review:respondToFinding'].result.parse(response.data);
      if (!result.ok) {
        const errors = {
          'no-thread': 'This finding has no published GitHub thread.',
          'ambiguous-thread': 'More than one GitHub thread matches this finding. Reply on GitHub.',
          'publication-unavailable': 'GitHub publication is paused or the pull request has new commits. The reply was not posted.',
          'github-error': 'GitHub rejected the reply.',
          'run-not-found': 'This review run is unavailable.',
        };
        this.update(view.key, { error: result.code ? errors[result.code] : 'The action failed.' });
        return;
      }
      this.update(view.key, action === 'reply' ? { replied: true } : { state: action === 'accept' ? 'accepted' : 'dismissed' });
    } catch {
      if (this.runs.selectedAttemptId() === attemptId) this.update(view.key, { error: 'The action failed.' });
    } finally {
      if (this.runs.selectedAttemptId() === attemptId) this.update(view.key, { pending: false });
    }
  }

  async openEvidence(path: string, line: number | null): Promise<void> {
    // A late result of an earlier run must not write the signals of the run that is selected now.
    const attemptId = this.runs.selectedAttemptId();
    const current = (): boolean => this.runs.selectedAttemptId() === attemptId;
    this.openError.set(null);
    const workspaceRoot = this.runs.repositoryRoot();
    if (!workspaceRoot) {
      this.openError.set('The reviewed repository is not open in Ptah. Add its folder as a workspace.');
      return;
    }
    if (!isRepositoryRelativePath(path)) {
      this.openError.set('Could not open the file. Its path is not inside the reviewed repository.');
      return;
    }
    try {
      // The host resolves the path against workspaceRoot and refuses a path that leaves that root.
      const params: FileOpenParams = { path, workspaceRoot, ...(line === null ? {} : { line }) };
      const response = await this.rpc.call('file:open', params, { timeout: 30_000 });
      if (!current()) return;
      if (!response.isSuccess()) throw new Error('rpc');
      const result: FileOpenResult = response.data;
      if (!result.success && !result.cancelled) this.openError.set('Could not open the file from the reviewed repository.');
    } catch {
      if (current()) this.openError.set('Could not open the file from the reviewed repository.');
    }
  }

  async sendToLane(view: ReviewFindingView): Promise<void> {
    const attemptId = this.runs.selectedAttemptId();
    const current = (): boolean => this.runs.selectedAttemptId() === attemptId;
    this.copyError.set(null);
    this.copied.set(false);
    const evidence = view.evidence.map(item => `${item.path}:${item.line} ${item.excerpt}`).join('\n');
    const prompt = `${view.title}\n${view.path}:${view.line ?? 'unknown'}\n\nEvidence:\n${evidence}\n\n${view.fixPrompt}`;
    try {
      await navigator.clipboard.writeText(prompt);
      if (current()) this.copied.set(true);
    } catch {
      if (current()) this.copyError.set('Could not copy the fix prompt.');
    }
  }
}
