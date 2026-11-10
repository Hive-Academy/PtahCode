import type { z } from 'zod';
import {
  ReviewRpcSchemas,
  REVIEW_TRIAGE_ACCEPTED_MARKER,
  REVIEW_TRIAGE_DISMISSED_MARKER,
  type ReviewRun,
} from '@ptah-extension/review-contracts';
import {
  findingMarker,
  safeText,
  type IReviewQueryRepository,
  type ReviewStageEnvironment,
} from '@ptah-extension/review-core';
import {
  GitHubReviewError,
  type GitHubFindingThread,
  type IGitHubFindingReplyPort,
  type IGitHubFindingThreadPort,
} from '@ptah-extension/review-github';
import type { Logger } from '@ptah-extension/vscode-core';

const schema = ReviewRpcSchemas['review:respondToFinding'];
export type FindingResponseParams = z.output<typeof schema.params>;
export type FindingResponseResult = z.output<typeof schema.result>;
type Triage = NonNullable<FindingResponseResult['triage']>;

export interface FindingResponseDeps {
  readonly query: Pick<IReviewQueryRepository, 'listPublishedTitles'>;
  readonly threads: IGitHubFindingThreadPort;
  readonly replies: IGitHubFindingReplyPort;
  readonly environment: Pick<ReviewStageEnvironment, 'redactionSecrets'>;
  readonly logger: Pick<Logger, 'info'>;
}

const noThread = (): FindingResponseResult =>
  schema.result.parse({ ok: false, code: 'no-thread', error: 'No published GitHub thread for this finding' });

/** The triage that a reply of the bot recorded on the thread, or null. The earliest marker reply is the record. */
export function recordedTriage(thread: Pick<GitHubFindingThread, 'replies'>): Triage | null {
  for (const reply of thread.replies) {
    if (reply.startsWith(REVIEW_TRIAGE_ACCEPTED_MARKER)) return 'accepted';
    if (reply.startsWith(REVIEW_TRIAGE_DISMISSED_MARKER)) return 'dismissed';
  }
  return null;
}

/** Posts the operator response to the GitHub thread of one finding. An accept or dismiss is idempotent. */
export class ReviewFindingResponder {
  /** Accept and dismiss calls in progress, by finding. A second call for the same finding gets the same result. */
  private readonly triageInFlight = new Map<string, { triage: Triage; result: Promise<FindingResponseResult> }>();

  constructor(private readonly deps: FindingResponseDeps) {}

  respond(run: ReviewRun, params: FindingResponseParams): Promise<FindingResponseResult> {
    if (params.action === 'reply') return this.execute(run, params);
    // The renderer can time out and call again while the first call still runs: do not start a second post.
    const key = JSON.stringify([params.attemptId, params.path, params.line, params.title]);
    const running = this.triageInFlight.get(key);
    // The joined call can have a different action: tell it which triage the first call recorded.
    if (running) return running.result.then((result) => (result.ok && !result.triage ? { ...result, triage: running.triage } : result));
    const result = this.execute(run, params).finally(() => this.triageInFlight.delete(key));
    this.triageInFlight.set(key, { triage: params.action === 'accept' ? 'accepted' : 'dismissed', result });
    return result;
  }

  private async execute(run: ReviewRun, params: FindingResponseParams): Promise<FindingResponseResult> {
    // Publication writes publishedFindingTitle(stored title) to the heading. The caller sends the listFindings
    // form of the title, so find the stored finding first and compare with the same published form.
    const secrets = (await this.deps.environment.redactionSecrets?.()) ?? [];
    // A thread is a target only when it has the heading and the hidden marker of that stored finding. Thus an
    // older comment of a different finding with the same path, line and title is not a target.
    const wanted = (await this.deps.query.listPublishedTitles(params.attemptId, secrets))
      .filter((item) => item.path === params.path && item.line === params.line && item.title.trim() === params.title)
      .map((item) => ({ heading: item.publishedTitle, marker: findingMarker(item.findingId) }));
    if (wanted.length === 0) return noThread();

    try {
      // One call reads the pull request comments one time.
      const scan = await this.deps.threads.listFindingThreads(run.repo, run.prNumber);
      // A truncated scan can hide a second matching thread or a triage reply: never treat it as complete.
      if (!scan.complete) {
        return schema.result.parse({ ok: false, code: 'ambiguous-thread', error: 'Too many GitHub comments to identify the thread' });
      }
      // Only a thread whose published body carries the finding title belongs to this finding.
      // The publisher writes the heading `### <badge> · <published title>`: compare the full published title.
      const titled = scan.threads.filter((thread) => {
        if (thread.path !== params.path || thread.line !== params.line) return false;
        const first = thread.body.split(/\r?\n/, 1)[0] ?? '';
        const separator = first.indexOf(' · ');
        return first.startsWith('### ') && separator !== -1
          && wanted.some((item) => item.heading === first.slice(separator + 3) && thread.body.includes(item.marker));
      });
      if (titled.length === 0) return noThread();
      const unresolved = titled.filter((thread) => !thread.resolved);
      const narrowed = titled.length === 1 ? titled : unresolved;
      const match = narrowed.length === 1 ? narrowed[0] : undefined;
      if (!match) return schema.result.parse({ ok: false, code: 'ambiguous-thread', error: 'Multiple GitHub threads match this finding' });

      if (params.action !== 'reply') {
        // A triage reply is permanent. When the thread already has one, an earlier call posted it and its
        // response was lost: report that result and do not post a second reply.
        const triage = recordedTriage(match);
        if (triage) return schema.result.parse({ ok: true, threadId: match.id, triage });
      }

      // The operator text goes to GitHub: apply the redaction that publication applies to finding text.
      const text = params.body ? safeText(params.body, secrets) : '';
      const note = text ? `\n\n${text}` : '';
      const body = params.action === 'accept' ? `${REVIEW_TRIAGE_ACCEPTED_MARKER}\nAccepted by the operator.${note}`
        : params.action === 'dismiss' ? `${REVIEW_TRIAGE_DISMISSED_MARKER}\nDismissed by the operator.${note}`
        : text;
      await this.deps.replies.replyToFinding({ repo: run.repo, number: run.prNumber, headSha: run.headSha }, match.id, body);
      return schema.result.parse({ ok: true, threadId: match.id });
    } catch (error: unknown) {
      // degradation-audit: reported — a typed `publication-unavailable` or `github-error` result reaches the operator.
      if (error instanceof GitHubReviewError && error.code === 'publication-unavailable') {
        this.deps.logger.info('[review] the publication guard refused a finding reply');
        return schema.result.parse({ ok: false, code: 'publication-unavailable',
          error: 'GitHub publication is paused or the pull request head changed. The reply was not posted.' });
      }
      // GitHub adapter errors may contain credentials. Log only a sanitized Error.
      this.deps.logger.info('[review] GitHub finding lookup or reply failed', new Error('GitHub request failed'));
      return schema.result.parse({ ok: false, code: 'github-error', error: 'GitHub rejected the reply' });
    }
  }
}
