import { Injectable, effect, inject, signal } from '@angular/core';
import { ClaudeRpcService } from '@ptah-extension/core';
import { ReviewRpcSchemas } from '@ptah-extension/review-contracts';
import type { FileOpenParams, FileOpenResult } from '@ptah-extension/shared';
import { ReviewRunsStore } from '../review-runs.store';
import { openTriage, type FindingTriage, type ReviewFindingView, type TriageMap } from './review-finding-view';

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
    this.openError.set(null);
    try {
      const params: FileOpenParams = { path, ...(line === null ? {} : { line }) };
      const response = await this.rpc.call('file:open', params, { timeout: 30_000 });
      if (!response.isSuccess()) throw new Error('rpc');
      const result: FileOpenResult = response.data;
      if (!result.success && !result.cancelled) this.openError.set('Could not open the file. Make sure that the reviewed repository is the open workspace.');
    } catch {
      this.openError.set('Could not open the file. Make sure that the reviewed repository is the open workspace.');
    }
  }

  async sendToLane(view: ReviewFindingView): Promise<void> {
    this.copyError.set(null);
    this.copied.set(false);
    const evidence = view.evidence.map(item => `${item.path}:${item.line} ${item.excerpt}`).join('\n');
    const prompt = `${view.title}\n${view.path}:${view.line ?? 'unknown'}\n\nEvidence:\n${evidence}\n\n${view.fixPrompt}`;
    try {
      await navigator.clipboard.writeText(prompt);
      this.copied.set(true);
    } catch {
      this.copyError.set('Could not copy the fix prompt.');
    }
  }
}
