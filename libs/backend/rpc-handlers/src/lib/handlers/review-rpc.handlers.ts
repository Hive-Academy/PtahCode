import { realpath } from 'node:fs/promises';
import { relative } from 'node:path';
import { inject, injectable } from 'tsyringe';
import { ulid } from 'ulid';
import { z, ZodError } from 'zod';
import {
  ReviewLaneCatalogSchema,
  ReviewLaneListingEntrySchema,
  ReviewRpcSchemas,
  type IGitHubReviewPort,
  type RepoIdentity,
  type ReviewLaneCatalog,
  type ReviewLaneListingEntry,
  type ReviewLaneSettings,
} from '@ptah-extension/review-contracts';
import {
  REVIEW_CORE_TOKENS,
  REVIEW_LANE_TOKENS,
  ReviewPollDisabledError,
  type IReviewLaneSettingsStore,
  type ReviewLaneSource,
  type IReviewArtifactReader,
  type IReviewQueryRepository,
  type IReviewSecretPresence,
  type IReviewSettingsStore,
  type ReviewQueueService,
  type ReviewOrchestratorService,
  ReviewPolicyService,
  type ReviewStageEnvironment,
} from '@ptah-extension/review-core';
import {
  PLATFORM_TOKENS,
  type ISecretStorage,
  type IWorkspaceProvider,
} from '@ptah-extension/platform-core';
import {
  REVIEW_GITHUB_TOKEN_KEY,
  REVIEW_GITHUB_TOKENS,
  type IGitHubFindingReplyPort,
  type IGitHubFindingThreadPort,
} from '@ptah-extension/review-github';
import {
  RpcUserError,
  TOKENS,
  type Logger,
  type RpcHandler,
} from '@ptah-extension/vscode-core';
import type { RpcMethodName } from '@ptah-extension/shared';
import { ReviewFindingResponder } from './review-finding-response';

const empty = z.object({}).strict();
/** Bound for the per-lane model catalog reads of `review:listLanes`. */
const LANE_CATALOG_TIMEOUT_MS = 10_000;
const LISTED_LANES_MAX = 100;
const unreadCatalog: ReviewLaneCatalog = { status: 'failed', models: [], truncated: false, verifiable: false };
const ok = z.object({ ok: z.literal(true) }).strict();
const tokenParams = z.object({ token: z.string().min(1).max(4096) }).strict();
const rerunParams = z
  .object({ attemptId: z.string().min(1).max(64), dryRun: z.boolean() })
  .strict();
const rerunResult = z.object({ attemptId: z.string().min(1).max(64) }).strict();
const identity = z
  .object({
    login: z.string().min(1).max(39),
    scopes: z.array(z.string()),
    connectedAt: z.string().datetime(),
    verifiedAt: z.string().datetime().nullable(),
    tokenStorage: z.enum(['encrypted', 'plaintext']),
  })
  .strict()
  .nullable();

@injectable()
export class ReviewRpcHandlers {
  private readonly refreshPolls = new Map<string, Promise<number>>();
  private readonly responder: ReviewFindingResponder;
  static readonly METHODS = [
    'review:getBotIdentity',
    'review:setBotToken',
    'review:clearBotToken',
    'review:rerun',
    'review:listRuns',
    'review:getRun',
    'review:listFindings',
    'review:listRepositories',
    'review:getSettings',
    'review:listLanes',
    'review:updateSettings',
    'review:setPublicationPause',
    'review:retryHead',
    'review:refresh',
    'review:exportRun',
    'review:respondToFinding',
  ] as const satisfies readonly RpcMethodName[];

  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: Pick<Logger, 'info'>,
    @inject(TOKENS.RPC_HANDLER)
    private readonly rpc: Pick<RpcHandler, 'registerMethod'>,
    @inject(REVIEW_CORE_TOKENS.QUERY_REPOSITORY)
    private readonly query: IReviewQueryRepository,
    @inject(REVIEW_CORE_TOKENS.SETTINGS_STORE)
    private readonly settings: IReviewSettingsStore,
    @inject(REVIEW_CORE_TOKENS.ARTIFACT_READER)
    private readonly artifacts: IReviewArtifactReader,
    @inject(REVIEW_CORE_TOKENS.SECRET_PRESENCE)
    private readonly secrets: IReviewSecretPresence,
    @inject(REVIEW_CORE_TOKENS.QUEUE_SERVICE)
    private readonly queue: Pick<ReviewQueueService, 'retry'>,
    @inject(REVIEW_CORE_TOKENS.ORCHESTRATOR)
    private readonly orchestrator: Pick<
      ReviewOrchestratorService,
      'pollAndRecord'
    >,
    @inject(REVIEW_CORE_TOKENS.GITHUB)
    private readonly github: Pick<IGitHubReviewPort, 'getPull'>,
    @inject(PLATFORM_TOKENS.SECRET_STORAGE)
    private readonly tokenStorage: ISecretStorage,
    @inject(REVIEW_GITHUB_TOKENS.FETCH) private readonly fetcher: typeof fetch,
    @inject(ReviewPolicyService) private readonly policy: ReviewPolicyService,
    @inject(REVIEW_CORE_TOKENS.ENVIRONMENT)
    private readonly environment: ReviewStageEnvironment,
    @inject(REVIEW_GITHUB_TOKENS.PUBLICATION_PORT)
    private readonly replies: IGitHubFindingReplyPort,
    @inject(PLATFORM_TOKENS.WORKSPACE_PROVIDER)
    private readonly workspace: Pick<IWorkspaceProvider, 'getWorkspaceFolders'>,
    @inject(REVIEW_GITHUB_TOKENS.REVIEW_PORT) threads: IGitHubFindingThreadPort,
    @inject(REVIEW_CORE_TOKENS.LANE_SETTINGS_STORE)
    private readonly laneSettings: IReviewLaneSettingsStore,
    @inject(REVIEW_LANE_TOKENS.GATEWAY) private readonly lanes: ReviewLaneSource,
  ) {
    this.responder = new ReviewFindingResponder({ query, threads, replies, environment, logger });
  }

  /** The registered workspace folder that is the checkout of the repository, or null when that checkout is not open. */
  private async repositoryRoot(repo: RepoIdentity): Promise<string | null> {
    let checkout: string;
    try {
      // An old run stays readable after its repository is disabled: checkoutRoot does not examine the settings.
      checkout = this.environment.checkoutRoot
        ? await this.environment.checkoutRoot(repo)
        : (await this.environment.resolve(repo)).repoRoot;
    } catch (_error: unknown) {
      // degradation-audit: reported — a null root makes the renderer tell the operator that the repository is not open.
      return null;
    }
    const folders = this.workspace.getWorkspaceFolders();
    const real = await Promise.allSettled(folders.map((folder) => realpath(folder)));
    // path.relative compares without case on Windows, as the file system does.
    const index = real.findIndex((item) => item.status === 'fulfilled' && relative(item.value, checkout) === '');
    return index === -1 ? null : folders[index];
  }

  private async safe<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error: unknown) {
      if (error instanceof RpcUserError) throw error;
      if (error instanceof ReviewPollDisabledError)
        throw new RpcUserError(
          'Review repository is disabled',
          'REVIEW_DISABLED',
        );
      if (error instanceof ZodError)
        throw new RpcUserError('Invalid review request', 'INVALID_PARAMS');
      // Never log an untrusted exception: an adapter error may include a credential.
      throw new RpcUserError(
        'Review service is unavailable',
        'PERSISTENCE_UNAVAILABLE',
      );
    }
  }

  /** The lane list with a catalog per lane, and the saved models that the block list refuses. */
  private async laneListing(): Promise<{ lanes: ReviewLaneListingEntry[]; blockedModels: string[] }> {
    // A list failure propagates: safe() maps it to a generic error, and the drawer offers Retry.
    const { lanes } = await this.lanes.list();
    const listed = lanes.slice(0, LISTED_LANES_MAX);
    const [catalogs, saved] = await Promise.all([
      this.lanes
        .listModels(listed.map((lane) => lane.id), AbortSignal.timeout(LANE_CATALOG_TIMEOUT_MS))
        .catch((_error: unknown): Record<string, ReviewLaneCatalog> => {
          // degradation-audit: reported — every lane then shows a failed catalog, which the drawer reports.
          this.logger.info('[review] Lane model catalogs unavailable');
          return {};
        }),
      this.laneSettings.get(),
    ]);
    const entries = listed.flatMap((lane) => {
      const catalog = ReviewLaneCatalogSchema.safeParse(catalogs[lane.id]);
      const entry = ReviewLaneListingEntrySchema.safeParse({
        id: lane.id,
        label: lane.label,
        family: lane.family,
        limitState: lane.limitState,
        catalog: catalog.success ? catalog.data : unreadCatalog,
      });
      // A lane the listing contract cannot carry is left out; the other lanes still render.
      return entry.success ? [entry.data] : [];
    });
    return { lanes: entries, blockedModels: this.blockedModels(saved) };
  }

  private blockedModels(saved: ReviewLaneSettings): string[] {
    const models = [...saved.pool, ...Object.values(saved.pins)]
      .map((entry) => entry?.model ?? null)
      .filter((model): model is string => model !== null);
    return [...new Set(models)].filter((model) => this.lanes.modelBlocked(model));
  }

  private async botVerified(expectedLogin: string): Promise<boolean> {
    const token = await this.tokenStorage.get(REVIEW_GITHUB_TOKEN_KEY);
    if (!token) return false;
    const response = await this.fetcher('https://api.github.com/user', {
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'PtahReview/1.0',
      },
    });
    if (!response.ok) return false;
    const body = await response.text();
    if (body.length > 65_536) return false;
    const user = z
      .object({ login: z.string().min(1).max(39) })
      .safeParse(JSON.parse(body));
    return (
      user.success &&
      user.data.login.toLowerCase() === expectedLogin.toLowerCase()
    );
  }

  register(): void {
    this.rpc.registerMethod('review:getBotIdentity', (raw) =>
      this.safe(async () => {
        empty.parse(raw);
        const token = await this.tokenStorage.get(REVIEW_GITHUB_TOKEN_KEY);
        if (!token) return identity.parse(null);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        try {
          let response: Response;
          try {
            response = await this.fetcher('https://api.github.com/user', {
              signal: controller.signal,
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'User-Agent': 'PtahReview/1.0',
              },
            });
          } catch (error: unknown) {
            if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))
              throw new RpcUserError('GitHub bot verification timed out', 'REVIEW_DISABLED');
            throw new RpcUserError('Could not reach GitHub to verify the bot token', 'REVIEW_DISABLED');
          }
          if (response.status === 401 || response.status === 403)
            throw new RpcUserError('GitHub rejected the bot token or its permissions', 'REVIEW_DISABLED');
          if (!response.ok)
            throw new RpcUserError('GitHub bot verification is unavailable', 'REVIEW_DISABLED');
          const body = await response.text();
          if (body.length > 65_536)
            throw new Error('Bot identity response too large');
          const user = z
            .object({ login: z.string().min(1).max(39) })
            .parse(JSON.parse(body));
          const now = new Date().toISOString();
          const previous = await this.settings.getLiveGate();
          const settings = await this.settings.getSettings();
          const repo =
            settings?.repositories.find(
              (entry) =>
                entry.owner === previous?.repo.owner &&
                entry.name === previous?.repo.name,
            ) ??
            settings?.repositories[0] ??
            null;
          if (repo)
            await this.settings.setLiveGate({
              repo: { owner: repo.owner, name: repo.name },
              login: user.login,
              connectedAt:
                previous?.login === user.login ? previous.connectedAt : now,
              verifiedAt: now,
              attestation:
                previous?.login === user.login ? previous.attestation : null,
            });
          return identity.parse({
            login: user.login,
            scopes: (response.headers.get('x-oauth-scopes') ?? '')
              .split(',')
              .map((scope) => scope.trim())
              .filter(Boolean),
            connectedAt:
              previous?.login === user.login ? previous.connectedAt : now,
            verifiedAt: now,
            tokenStorage: this.tokenStorage.storageMode?.() ?? 'encrypted',
          });
        } finally {
          clearTimeout(timer);
        }
      }),
    );
    this.rpc.registerMethod('review:setBotToken', (raw) =>
      this.safe(async () => {
        const { token } = tokenParams.parse(raw);
        await this.tokenStorage.store(REVIEW_GITHUB_TOKEN_KEY, token);
        await this.settings.setLiveGate(null);
        return ok.parse({ ok: true });
      }),
    );
    this.rpc.registerMethod('review:clearBotToken', (raw) =>
      this.safe(async () => {
        empty.parse(raw);
        await this.tokenStorage.delete(REVIEW_GITHUB_TOKEN_KEY);
        await this.settings.setLiveGate(null);
        return ok.parse({ ok: true });
      }),
    );
    this.rpc.registerMethod('review:rerun', (raw) =>
      this.safe(async () => {
        const { attemptId: priorId, dryRun } = rerunParams.parse(raw);
        const prior = await this.query.getRun(priorId);
        if (!prior)
          throw new RpcUserError('Review run not found', 'TASK_NOT_FOUND');
        const pull = await this.github.getPull(prior.repo, prior.prNumber);
        if (pull.headSha !== prior.headSha || pull.state !== 'open')
          throw new RpcUserError(
            'Pull request head changed',
            'REVIEW_DISABLED',
          );
        const settings = await this.settings.getSettings();
        const config = await this.environment.baseConfig(
          prior.repo,
          pull.baseSha,
        );
        const eligible = this.policy.eligibility({
          owner: prior.repo.owner,
          name: prior.repo.name,
          authorLogin: pull.authorLogin,
          state: pull.state,
          draft: pull.draft,
          headIsFork: pull.headIsFork,
          headRepoId: pull.headRepoId,
          baseRepoId: pull.baseRepoId,
          settings,
          baseConfig: config,
        }).eligible;
        const gate = await this.settings.getLiveGate();
        if (
          !eligible ||
          (!dryRun &&
            (!this.policy.publication(settings, config, prior.repo).allowed ||
              !gate?.attestation ||
              gate.repo.owner !== prior.repo.owner ||
              gate.repo.name !== prior.repo.name ||
              !(await this.botVerified(gate.login))))
        )
          throw new RpcUserError(
            'Review publication is unavailable',
            'REVIEW_DISABLED',
          );
        const attemptId = ulid();
        await this.queue.retry(
          { repo: prior.repo, prNumber: prior.prNumber, headSha: pull.headSha },
          attemptId,
          dryRun,
        );
        return rerunResult.parse({ attemptId });
      }),
    );
    this.rpc.registerMethod('review:listRuns', (raw) =>
      this.safe(async () => {
        const params = ReviewRpcSchemas['review:listRuns'].params.parse(raw);
        return ReviewRpcSchemas['review:listRuns'].result.parse(
          await this.query.listRuns(params),
        );
      }),
    );
    this.rpc.registerMethod('review:getRun', (raw) =>
      this.safe(async () => {
        const { attemptId } =
          ReviewRpcSchemas['review:getRun'].params.parse(raw);
        return ReviewRpcSchemas['review:getRun'].result.parse(
          await this.query.getRun(attemptId),
        );
      }),
    );
    this.rpc.registerMethod('review:listFindings', (raw) =>
      this.safe(async () => {
        const { attemptId } =
          ReviewRpcSchemas['review:listFindings'].params.parse(raw);
        const run = await this.query.getRun(attemptId);
        if (!run) return { findings: [] };
        return ReviewRpcSchemas['review:listFindings'].result.parse({
          // The renderer can copy these fields to the clipboard: remove the configured secrets, as publication does.
          findings: await this.query.listFindings(attemptId, (await this.environment.redactionSecrets?.()) ?? []),
          repositoryRoot: await this.repositoryRoot(run.repo),
        });
      }),
    );
    this.rpc.registerMethod('review:listRepositories', (raw) =>
      this.safe(async () => {
        ReviewRpcSchemas['review:listRepositories'].params.parse(raw);
        return ReviewRpcSchemas['review:listRepositories'].result.parse(
          await this.settings.listRepositories(),
        );
      }),
    );
    this.rpc.registerMethod('review:getSettings', (raw) =>
      this.safe(async () => {
        ReviewRpcSchemas['review:getSettings'].params.parse(raw);
        const settings = await this.settings.getSettings();
        return ReviewRpcSchemas['review:getSettings'].result.parse({
          settings,
          hasToken: await this.secrets.hasToken(),
          tokenStorage: this.tokenStorage.storageMode?.() ?? 'encrypted',
          lanes: await this.laneSettings.get(),
        });
      }),
    );
    this.rpc.registerMethod('review:listLanes', (raw) =>
      this.safe(async () => {
        ReviewRpcSchemas['review:listLanes'].params.parse(raw);
        return ReviewRpcSchemas['review:listLanes'].result.parse(
          await this.laneListing(),
        );
      }),
    );
    this.rpc.registerMethod('review:updateSettings', (raw) =>
      this.safe(async () => {
        const parsed = ReviewRpcSchemas['review:updateSettings'].params.safeParse(raw);
        if (!parsed.success) {
          // Nothing is written when any part of the request is invalid (Req 1.2).
          if (parsed.error.issues.some((issue) => issue.path[0] === 'lanes'))
            throw new RpcUserError('Review lanes were not saved: the lane settings are invalid', 'INVALID_PARAMS');
          throw parsed.error;
        }
        const { settings, attestation, lanes } = parsed.data;
        if (
          settings.repositories.some((repo) => !repo.dryRun) &&
          !(await this.secrets.hasToken())
        )
          throw new RpcUserError(
            'Connect a bot token before enabling live publication',
            'REVIEW_DISABLED',
          );
        if (
          settings.repositories.filter((repo) => repo.enabled && !repo.dryRun)
            .length > 1
        )
          throw new RpcUserError(
            'Only one repository can publish live at a time',
            'REVIEW_DISABLED',
          );
        const liveRepo = settings.repositories.find((entry) => entry.enabled && !entry.dryRun);
        const previousGate = await this.settings.getLiveGate();
        let verifiedLogin: string | null = null;
        if (liveRepo) {
          const token = await this.tokenStorage.get(REVIEW_GITHUB_TOKEN_KEY);
          if (!token) throw new RpcUserError('Connect a bot token before enabling live publication', 'REVIEW_DISABLED');
          const response = await this.fetcher('https://api.github.com/user', {
            signal: AbortSignal.timeout(10_000),
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'PtahReview/1.0' },
          });
          if (!response.ok) throw new RpcUserError('Bot identity verification failed', 'REVIEW_DISABLED');
          const body = await response.text();
          if (body.length > 65_536) throw new RpcUserError('Bot identity verification failed', 'REVIEW_DISABLED');
          verifiedLogin = z.object({ login: z.string().min(1).max(39) }).parse(JSON.parse(body)).login;
          const sameRepo = previousGate?.repo.owner.toLowerCase() === liveRepo.owner.toLowerCase()
            && previousGate?.repo.name.toLowerCase() === liveRepo.name.toLowerCase();
          const permission = attestation ?? (sameRepo ? previousGate?.attestation : null);
          if (!permission || !settings.maintainerLogins.some((login) => login.toLowerCase() === permission.who.toLowerCase()))
            throw new RpcUserError('Permission attestation required for this repository', 'REVIEW_DISABLED');
        }
        const saved = await this.settings.updateSettings(settings);
        if (liveRepo && verifiedLogin) {
          const sameRepo = previousGate?.repo.owner.toLowerCase() === liveRepo.owner.toLowerCase()
            && previousGate?.repo.name.toLowerCase() === liveRepo.name.toLowerCase();
          await this.settings.setLiveGate({
            repo: { owner: liveRepo.owner, name: liveRepo.name },
            login: verifiedLogin,
            connectedAt: sameRepo && previousGate?.login.toLowerCase() === verifiedLogin.toLowerCase()
              ? previousGate.connectedAt : new Date().toISOString(),
            verifiedAt: new Date().toISOString(),
            attestation: attestation
              ? { ...attestation, when: new Date().toISOString() }
              : sameRepo ? previousGate?.attestation ?? null : null,
          });
        } else if (previousGate) {
          await this.settings.setLiveGate(null);
        }
        // Lanes go last: the live-gate checks above can reject the call and must not leave lane
        // changes behind. Save is idempotent, so a second Save completes a failed lane write.
        if (lanes) {
          try {
            await this.laneSettings.update(lanes);
          } catch {
            // degradation-audit: reported — the operator sees this error; the adapter error is not logged.
            throw new RpcUserError('Review lanes were not saved', 'PERSISTENCE_UNAVAILABLE');
          }
        }
        return ReviewRpcSchemas['review:updateSettings'].result.parse(saved);
      }),
    );
    this.rpc.registerMethod('review:setPublicationPause', (raw) =>
      this.safe(async () => {
        const { paused, repo } =
          ReviewRpcSchemas['review:setPublicationPause'].params.parse(raw);
        await this.settings.setPublicationPause(paused, repo);
        return ReviewRpcSchemas['review:setPublicationPause'].result.parse({
          ok: true,
        });
      }),
    );
    this.rpc.registerMethod('review:retryHead', (raw) =>
      this.safe(async () => {
        const { repo, prNumber } =
          ReviewRpcSchemas['review:retryHead'].params.parse(raw);
        const pull = await this.github.getPull(repo, prNumber);
        const attemptId = ulid();
        let settings: Awaited<ReturnType<IReviewSettingsStore['getSettings']>> = null;
        try {
          settings = await this.settings.getSettings();
        } catch (_error: unknown) {
          this.logger.info('Review settings unavailable for retry; queueing dry-run');
        }
        const dryRun = settings?.repositories.find((entry) => entry.owner.toLowerCase() === repo.owner.toLowerCase() &&
          entry.name.toLowerCase() === repo.name.toLowerCase())?.dryRun ?? true;
        await this.queue.retry(
          { repo, prNumber, headSha: pull.headSha },
          attemptId,
          dryRun,
        );
        return ReviewRpcSchemas['review:retryHead'].result.parse({
          ok: true,
          attemptId,
        });
      }),
    );
    this.rpc.registerMethod('review:refresh', (raw) =>
      this.safe(async () => {
        const { repo } = ReviewRpcSchemas['review:refresh'].params.parse(raw);
        const key = `${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}`;
        if (!this.refreshPolls.has(key)) {
          const poll = this.orchestrator.pollAndRecord(repo);
          this.refreshPolls.set(key, poll);
          void poll.catch(() => {
            // degradation-audit: reported — pollAndRecord persists failure for the poll-status banner.
          }).finally(() => {
            if (this.refreshPolls.get(key) === poll) this.refreshPolls.delete(key);
          });
        }
        return ReviewRpcSchemas['review:refresh'].result.parse({ ok: true });
      }),
    );
    this.rpc.registerMethod('review:exportRun', (raw) =>
      this.safe(async () => {
        const { attemptId } =
          ReviewRpcSchemas['review:exportRun'].params.parse(raw);
        if (!(await this.query.getRun(attemptId)))
          throw new RpcUserError('Review run not found', 'TASK_NOT_FOUND');
        return ReviewRpcSchemas['review:exportRun'].result.parse(
          await this.artifacts.exportRun(attemptId),
        );
      }),
    );
    this.rpc.registerMethod('review:respondToFinding', (raw) =>
      this.safe(async () => {
        const params = ReviewRpcSchemas['review:respondToFinding'].params.parse(raw);
        const run = await this.query.getRun(params.attemptId);
        const response = ReviewRpcSchemas['review:respondToFinding'].result;
        if (!run) return response.parse({ ok: false, code: 'run-not-found', error: 'Review run not found' });
        return this.responder.respond(run, params);
      }),
    );
    this.logger.info('[review] RPC handlers registered');
  }
}
