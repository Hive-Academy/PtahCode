import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import type { IReviewStatusPort, ReviewStatusReceipt, ReviewStatusTarget, ReviewStatusUpdate } from '@ptah-extension/review-contracts';
import { ReviewStatusTargetSchema, ReviewStatusUpdateSchema } from '@ptah-extension/review-contracts';
import { PLATFORM_TOKENS, type ISecretStorage } from '@ptah-extension/platform-core';
import { REVIEW_GITHUB_TOKEN_KEY, REVIEW_GITHUB_TOKENS } from '../di/tokens';
import { GitHubReviewError } from './github-review.error';
import { GithubReviewPublicationAdapter } from './github-review-publication.adapter';

const API = 'https://api.github.com';
const MAX_BYTES = 1024 * 1024;
const statusSchema = z.object({ context: z.string(), description: z.string().nullable(), state: z.enum(['pending', 'success', 'failure', 'error']), id: z.number().int().positive() });
const statusesSchema = z.array(statusSchema);

/** Commit statuses are append-only on GitHub; the stable context identifies an attempt. */
@injectable()
export class GithubReviewStatusAdapter implements IReviewStatusPort {
  constructor(
    @inject(PLATFORM_TOKENS.SECRET_STORAGE) private readonly secrets: ISecretStorage,
    @inject(REVIEW_GITHUB_TOKENS.FETCH) private readonly fetcher: typeof fetch,
    @inject(GithubReviewPublicationAdapter) private readonly publication?: GithubReviewPublicationAdapter,
  ) {}

  async updateProgressComment(target: ReviewStatusTarget, summary: string): Promise<void> {
    if (this.publication) await this.publication.updateProgress({ repo: target.repo, number: target.prNumber,
      headSha: target.headSha }, summary);
  }

  private context(_target: ReviewStatusTarget): string {
    return 'PtahCode Review';
  }

  private async request(target: ReviewStatusTarget, method: 'GET' | 'POST', body?: object): Promise<Response> {
    const token = await this.secrets.get(REVIEW_GITHUB_TOKEN_KEY);
    if (!token) throw new GitHubReviewError('missing-token', 'GitHub bot token is unavailable');
    const { owner, name } = target.repo;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await this.fetcher(`${API}/repos/${owner}/${name}/statuses/${target.headSha}`, {
        method, signal: controller.signal, ...(body ? { body: JSON.stringify(body) } : {}),
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'PtahReview/1.0' },
      });
      if (response.status === 401) throw new GitHubReviewError('authentication', 'GitHub bot authentication failed');
      const remaining = response.headers.get('x-ratelimit-remaining');
      const retryAfter = response.headers.get('retry-after');
      if (response.status === 429 || response.status === 403 && (remaining === '0' || retryAfter !== null)) {
        const seconds = retryAfter === null ? NaN : Number(retryAfter);
        const reset = Number(response.headers.get('x-ratelimit-reset'));
        const at = Number.isFinite(seconds) ? Date.now() + Math.max(0, seconds) * 1000
          : Number.isFinite(reset) && reset > 0 ? reset * 1000 : Date.now() + 60_000;
        throw new GitHubReviewError('rate-limit', 'GitHub requests are deferred', new Date(at));
      }
      if (response.status === 403) throw new GitHubReviewError('permission',
        'GitHub bot token cannot access commit statuses. Grant it the "Commit statuses: Read and write" repository permission');
      if (!response.ok) throw new GitHubReviewError('http', `GitHub returned HTTP ${response.status}`);
      const text = await response.text();
      if (text.length > MAX_BYTES) throw new GitHubReviewError('malformed-response', 'GitHub response is too large');
      return new Response(text, { status: response.status, headers: response.headers });
    } catch (error) {
      if (controller.signal.aborted) throw new GitHubReviewError('timeout', 'GitHub status request timed out');
      if (error instanceof GitHubReviewError) throw error;
      throw new GitHubReviewError('http', 'GitHub status request failed');
    } finally { clearTimeout(timer); }
  }

  private async latestStatus(target: ReviewStatusTarget): Promise<z.infer<typeof statusSchema> | null> {
    const response = await this.request(target, 'GET');
    let value: unknown;
    try { value = JSON.parse(await response.text()); }
    catch { throw new GitHubReviewError('malformed-response', 'GitHub returned invalid JSON'); }
    const parsed = statusesSchema.safeParse(value);
    if (!parsed.success) throw new GitHubReviewError('malformed-response', 'GitHub returned invalid statuses');
    return parsed.data.find(status => status.context === this.context(target)) ?? null;
  }

  async findOwnStatus(input: ReviewStatusTarget): Promise<ReviewStatusReceipt | null> {
    const target = ReviewStatusTargetSchema.parse(input);
    const own = await this.latestStatus(target);
    return own ? { target, provider: 'commit_status', externalId: String(own.id) } : null;
  }

  async upsertStatus(input: ReviewStatusUpdate, previous?: ReviewStatusReceipt | null): Promise<ReviewStatusReceipt> {
    const update = ReviewStatusUpdateSchema.parse(input);
    const target = update.target;
    if (previous && (previous.provider !== 'commit_status' || JSON.stringify(previous.target) !== JSON.stringify(target)))
      throw new GitHubReviewError('malformed-response', 'Status receipt does not match the target');
    const state = update.state === 'completed'
      ? update.conclusion === 'success' ? 'success'
        : update.conclusion === 'cancelled' ? 'error' : 'failure' : 'pending';
    const description = update.description;
    // A POST may have succeeded before a timeout. Commit statuses are append-only, so
    // compare the latest public value before retrying an uncertain write.
    const current = await this.latestStatus(target);
    if (current?.state === state && current.description === description)
      return { target, provider: 'commit_status', externalId: String(current.id) };
    const response = await this.request(target, 'POST', { state, context: this.context(target),
      description: description.slice(0, 140) });
    let value: unknown;
    try { value = JSON.parse(await response.text()); }
    catch { throw new GitHubReviewError('malformed-response', 'GitHub returned invalid JSON'); }
    const parsed = statusSchema.safeParse(value);
    if (!parsed.success || parsed.data.context !== this.context(target))
      throw new GitHubReviewError('malformed-response', 'GitHub returned an invalid status');
    return { target, provider: 'commit_status', externalId: String(parsed.data.id) };
  }
}
